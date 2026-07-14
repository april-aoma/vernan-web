import {
  aabbOverlap,
  knockbackFor,
  knockbackForFlintFirePull,
  knockbackForFrisbee,
  knockbackForPsychicDebris,
  type Aabb,
  type ProjectileStrike,
  type WeaponStrike,
} from "../combat/CombatMath";
import { BlackHeartBeatDeferral } from "../combat/BlackHeartBeatDeferral";
import {
  queueBlackHeartBurstKnock,
  releaseBlackHeartBeatKnockback,
  tickBlackHeartEnemyHitstun,
} from "../combat/BlackHeartEnemyCombat";
import { applyStrikeElectrocuteJuice, applySolidRedHitstunJuice } from "../combat/EnemyHitstunJuice";
import { KuriboStompFx } from "../combat/KuriboStompFx";
import {
  CRAWLER_H,
  CRAWLER_HOP_COOLDOWN_MAX,
  CRAWLER_HOP_COOLDOWN_MIN,
  CRAWLER_HOP_VX,
  CRAWLER_HOP_VX_MAX,
  CRAWLER_HOP_VY,
  CRAWLER_HOP_VY_MIN,
  CRAWLER_JUMPSQUAT_FRAMES,
  CRAWLER_MAX_HP,
  CRAWLER_WALK_SPEED,
  CRAWLER_W,
} from "../config/CombatStats";
import {
  ENEMY_CRAWLER_HIT_LOCAL,
  ENEMY_CRAWLER_HIT_PIVOT_X,
  ENEMY_CRAWLER_HOP_LOCAL,
  ENEMY_CRAWLER_HOP_PIVOT_X,
  ENEMY_CRAWLER_HURT_LOCAL,
  ENEMY_CRAWLER_HURT_PIVOT_X,
  ENEMY_CRAWLER_LOCAL,
  ENEMY_CRAWLER_PIVOT_X,
} from "../config/HitboxValues";
import {
  embeddedAsideFromFootprintFloor,
  nudgeCrawlerVerticallyIfEmbedded,
  resolveHorizontalPolygonEnemy,
  resolveVerticalCrawler,
} from "../collision/EnemyCollision";
import { HitboxPose } from "../collision/HitboxPose";
import { GRAVITY, MAX_FALL } from "../config/Physics";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import {
  isGrounded,
  ridingDeck,
  solidUnderFootAhead,
} from "./EnemyPeerPlatforms";
import { isPeerWalkingEnemy, type PeerWalkingEnemy } from "./PeerWalkingEnemy";
import type { PeerRidingBehavior } from "./PeerRidingBehavior";
import { SquashStretch } from "../render/SquashStretch";
import { HURT_TINT_PEAK_ALPHA, HURT_TINT_SECONDS } from "../combat/HitlagState";

/**
 * Slim Crawler (Java Enemy.java hop/walk).
 * Stand/hop collision from ENEMY_CRAWLER / ENEMY_CRAWLER_HOP; contact/hurt from HIT/HURT polys.
 */
export class Crawler implements PeerWalkingEnemy {
  x: number;
  y: number;
  w = CRAWLER_W;
  h = CRAWLER_H;
  vx = 0;
  vy = 0;
  onGround = false;
  facing = 1;
  hp: number;
  readonly maxHp: number;

  private hopCooldown: number;
  private jumpsquat = 0;
  hitstun = 0;
  private pendingKnockVx = 0;
  private pendingKnockVy = 0;
  private faceCooldown = 0;
  private animFrame = 0;
  private animAccum = 0;
  private pendingCorpseExplosion = false;
  private kuriboStompKillPending = false;
  private kuriboStompCorpseSec = 0;
  /** Java horizontalWallResolvedThisStep — wall snap this tick (turn after move). */
  private horizontalWallResolvedThisStep = false;
  /** Like Vernan normalJumpAirborne — gates ENEMY_CRAWLER_HOP collision until land. */
  private hopAirborne = false;
  private hurtLocked = false;
  private peerCarryAnchorX = 0;
  private peerCarryAnchorY = 0;
  private peerCarrierThisTick: CombatEnemy | null = null;

  readonly squash = new SquashStretch();
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  hitlagSolidRed = false;
  hitlagElectrocute = false;
  private hurtTintRemaining = 0;
  readonly blackHeartBeat = new BlackHeartBeatDeferral();

  constructor(x: number, y: number, maxHp = CRAWLER_MAX_HP) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.hopCooldown = CRAWLER_HOP_COOLDOWN_MIN;
  }

  getAnimFrame(): number {
    return this.animFrame;
  }

  update(
    dt: number,
    map: TileMap,
    playerX: number,
    roomEnemies: readonly CombatEnemy[] = [],
  ): void {
    this.squash.tick(dt);
    if (this.hurtTintRemaining > 0) {
      this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    }

    // Java: corpse stays through hitstun, then queues explosion (or Kuribo pancake linger).
    if (this.hp <= 0) {
      if (this.kuriboStompCorpseSec > 0) {
        this.kuriboStompCorpseSec = Math.max(0, this.kuriboStompCorpseSec - dt);
        if (this.kuriboStompCorpseSec <= 0) this.pendingCorpseExplosion = true;
        return;
      }
      if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
        const hadHitstun = this.hitstun > 0;
        tickBlackHeartEnemyHitstun(dt, this);
        if (hadHitstun && this.hitstun <= 0 && !this.blackHeartBeat.isLocked()) {
          if (this.kuriboStompKillPending) {
            this.kuriboStompKillPending = false;
            this.kuriboStompCorpseSec = KuriboStompFx.STOMP_CORPSE_LINGER_SEC;
            this.squash.applyStretchX(KuriboStompFx.STOMP_CORPSE_X, 999);
            return;
          }
          this.pendingCorpseExplosion = true;
        }
      }
      return;
    }

    if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
      const hadHitstun = this.hitstun > 0;
      tickBlackHeartEnemyHitstun(dt, this);
      if (hadHitstun && this.hitstun <= 0 && !this.blackHeartBeat.isLocked()) {
        this.finishHitstunKnockRelease();
      }
      if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
        this.vx = 0;
        this.vy = 0;
        return;
      }
    }

    const wasAirborneBeforeMove = !this.onGround;
    this.onGround = isGrounded(this, map, roomEnemies);
    const onDeck = ridingDeck(this, map, this.peerCarrierThisTick);

    if (this.faceCooldown > 0) this.faceCooldown--;
    else if (!onDeck) {
      const want = playerX + 5 < this.rect().x + this.rect().w * 0.5 ? -1 : 1;
      if (want !== this.facing) {
        this.facing = want;
        this.faceCooldown = 15;
      }
    }

    if (onDeck) {
      this.jumpsquat = 0;
      const carrier = this.peerCarrierThisTick;
      if (carrier && isPeerWalkingEnemy(carrier)) {
        this.vx = carrier.simulationVx();
        if (Math.abs(this.vx) > 1) this.facing = this.vx > 0 ? 1 : -1;
      }
    } else if (this.jumpsquat > 0) {
      this.jumpsquat--;
      this.vx = 0;
      this.vy = 0;
      this.squash.applyStretchXHeld(1.2, 1);
      if (this.jumpsquat === 0) {
        // Randomize hop height. Lower hops move faster horizontally (Java Enemy).
        const r = Math.random();
        const hopVy = CRAWLER_HOP_VY_MIN + (CRAWLER_HOP_VY - CRAWLER_HOP_VY_MIN) * r;
        const missing =
          1.0 - (hopVy - CRAWLER_HOP_VY_MIN) / Math.max(1e-6, CRAWLER_HOP_VY - CRAWLER_HOP_VY_MIN);
        const hopVx = CRAWLER_HOP_VX + (CRAWLER_HOP_VX_MAX - CRAWLER_HOP_VX) * missing;
        this.vx = this.facing * hopVx;
        this.vy = -hopVy;
        this.onGround = false;
        this.hopAirborne = true;
        this.squash.applyStretchY(1.2, 20);
        this.hopCooldown =
          CRAWLER_HOP_COOLDOWN_MIN +
          Math.random() * (CRAWLER_HOP_COOLDOWN_MAX - CRAWLER_HOP_COOLDOWN_MIN);
      }
    } else if (this.onGround) {
      this.hopCooldown -= dt;
      this.vx = this.facing * CRAWLER_WALK_SPEED;
      if (this.hopCooldown <= 0) {
        this.jumpsquat = CRAWLER_JUMPSQUAT_FRAMES;
        this.vx = 0;
      }
    }

    if (!onDeck) {
      this.applyGravity(dt);
    } else {
      this.vy = 0;
    }
    const impactVy = this.vy;
    const landed = this.moveAndCollide(dt, map, roomEnemies);
    if (
      embeddedAsideFromFootprintFloor(map, (ax, ay) => this.collisionPoseAt(ax, ay), this.x, this.y)
    ) {
      this.y = nudgeCrawlerVerticallyIfEmbedded(
        map,
        (ax, ay) => this.collisionPoseAt(ax, ay),
        this.x,
        this.y,
      );
    }
    this.onGround = isGrounded(this, map, roomEnemies);
    if (this.onGround) this.hopAirborne = false;
    if (landed && wasAirborneBeforeMove) {
      this.squash.applyStretchX(1.2, Math.abs(impactVy) >= 24 ? 20 : 5);
    }
    if (this.hurtLocked && landed) {
      this.hurtLocked = false;
    }
    if (this.onGround && this.jumpsquat === 0 && !onDeck) {
      if (!solidUnderFootAhead(this, map, roomEnemies, this.facing)) {
        this.facing = -this.facing;
      } else if (this.horizontalWallResolvedThisStep) {
        this.facing = -this.facing;
      }
    }
    this.tickAnim(dt);
  }

  private tickAnim(dt: number): void {
    if (this.jumpsquat > 0) return;
    const frameSeconds = this.onGround
      ? Math.abs(this.vx) > 1
        ? 0.22
        : 0.35
      : 0.08;
    this.animAccum += dt;
    while (this.animAccum >= frameSeconds) {
      this.animAccum -= frameSeconds;
      this.animFrame = (this.animFrame + 1) % 2;
    }
  }

  private finishHitstunKnockRelease(): void {
    this.vx = this.pendingKnockVx;
    this.vy = this.pendingKnockVy;
    this.pendingKnockVx = 0;
    this.pendingKnockVy = 0;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    this.hurtLocked = true;
    if (Math.abs(this.vx) + Math.abs(this.vy) > 1) {
      this.onGround = false;
      this.jumpsquat = 0;
    }
  }

  private crawlerPose(
    local: ReadonlyArray<number>,
    pivotLocalX: number,
    ax = this.x,
    ay = this.y,
  ): HitboxPose {
    return new HitboxPose(local, ax, ay, this.facing, pivotLocalX);
  }

  private usesHopCollisionHull(): boolean {
    return this.hopAirborne && !this.hurtLocked;
  }

  hitboxPose(): HitboxPose {
    return this.collisionPoseAt(this.x, this.y);
  }

  rect(): Aabb {
    return this.hitboxPose().bounds();
  }

  contactDamagePose(): Aabb {
    return this.crawlerPose(ENEMY_CRAWLER_HIT_LOCAL, ENEMY_CRAWLER_HIT_PIVOT_X).bounds();
  }

  damageReceivePose(): Aabb {
    return this.crawlerPose(ENEMY_CRAWLER_HURT_LOCAL, ENEMY_CRAWLER_HURT_PIVOT_X).bounds();
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.isDead()) return false;
    return this.crawlerPose(ENEMY_CRAWLER_HURT_LOCAL, ENEMY_CRAWLER_HURT_PIVOT_X).intersectsRect(
      sword,
    );
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.hp <= 0) return false;
    if (this.hitstun > 0 && strike.knockKind !== "black_heart_burst") return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    if (strike.knockKind === "black_heart_burst") {
      this.hitstun = queueBlackHeartBurstKnock(this.blackHeartBeat, strike, this.hitstun, this);
      this.hurtTintRemaining = HURT_TINT_SECONDS;
      return true;
    }
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    applyStrikeElectrocuteJuice(strike, this);
    const r = this.rect();
    const away =
      r.x + r.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kbSign =
      strike.knockKind === "stomp" || strike.knockKind === "stomp_electric"
        ? strike.facing
        : away;
    const kb = knockbackFor(strike.knockKind, kbSign);
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
    this.vx = 0;
    this.vy = 0;
    this.jumpsquat = 0;
    if (this.hp <= 0 && (strike.knockKind === "stomp" || strike.knockKind === "stomp_electric")) {
      this.kuriboStompKillPending = true;
    }
    return true;
  }

  releaseBlackHeartBeatKnockback(): void {
    releaseBlackHeartBeatKnockback(this.blackHeartBeat, (vx, vy) => {
      this.pendingKnockVx = vx;
      this.pendingKnockVy = vy;
      this.finishHitstunKnockRelease();
    });
  }

  isBlackHeartBeatLocked(): boolean {
    return this.blackHeartBeat.isLocked();
  }

  intersectsProjectile(projectile: HitboxPose): boolean {
    if (this.isDead()) return false;
    return projectile.intersectsRect(this.damageReceivePose());
  }

  applyProjectileStrike(strike: ProjectileStrike): boolean {
    if (this.hp <= 0 || this.hitstun > 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    applySolidRedHitstunJuice(this);
    let kbVx = 0;
    let kbVy = 0;
    if (strike.knockKind === "psychic_debris") {
      const r = this.rect();
      const kb = knockbackForPsychicDebris(
        r.x + r.w * 0.5,
        r.y + r.h * 0.5,
        strike.debrisCenterWorldX ?? r.x,
        strike.debrisCenterWorldY ?? r.y,
        strike.projectileVelX,
        strike.projectileVelY ?? 0,
        strike.damage,
      );
      kbVx = kb.vx;
      kbVy = kb.vy;
    } else if (strike.knockKind === "flint_fire_pull") {
      const r = this.rect();
      const kb = knockbackForFlintFirePull(
        r.x + r.w * 0.5,
        r.y + r.h * 0.5,
        strike.debrisCenterWorldX ?? r.x,
        strike.debrisCenterWorldY ?? r.y,
      );
      kbVx = kb.vx;
      kbVy = kb.vy;
    } else {
      const kb = knockbackForFrisbee(strike.projectileVelX);
      kbVx = kb.vx;
      kbVy = kb.vy;
    }
    this.pendingKnockVx = kbVx;
    this.pendingKnockVy = kbVy;
    this.vx = 0;
    this.vy = 0;
    this.jumpsquat = 0;
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.isDead() || this.hitstun > 0 || this.blackHeartBeat.isLocked()) return false;
    return aabbOverlap(playerHurt, this.contactDamagePose());
  }

  contactDamageToPlayer(): number {
    return 1;
  }

  getHealth(): number {
    return this.hp;
  }

  getMaxHealth(): number {
    return CRAWLER_MAX_HP;
  }

  /** Dead only after hitstun ends (Java Enemy.isDead). */
  isDead(): boolean {
    return this.hp <= 0 && this.hitstun <= 0;
  }

  /** Still drawing corpse during death hitstun. */
  isDyingVisually(): boolean {
    return this.hp <= 0;
  }

  takeCorpseExplosion(): boolean {
    if (!this.pendingCorpseExplosion) return false;
    this.pendingCorpseExplosion = false;
    return true;
  }

  blocksRoomClear(): boolean {
    return !(this.hp <= 0 && this.hitstun <= 0);
  }

  attackBlockedByShield(_attack: Aabb): boolean {
    return false;
  }

  applyShieldBlockStrike(_strike: WeaponStrike): void {}

  isInCombatHitstun(): boolean {
    return this.hitstun > 0 || this.blackHeartBeat.isLocked();
  }

  facingSign(): number {
    return this.facing;
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
  }

  peerRidingBehavior(): PeerRidingBehavior {
    return "ride_deck";
  }

  simulationVx(): number {
    return this.vx;
  }

  capturePeerCarryAnchor(): void {
    this.peerCarryAnchorX = this.x;
    this.peerCarryAnchorY = this.y;
  }

  peerCarryDeltaX(): number {
    return this.x - this.peerCarryAnchorX;
  }

  peerCarryDeltaY(): number {
    return this.y - this.peerCarryAnchorY;
  }

  translateWorld(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  facingHintVelX(): number {
    if (this.hitstun > 0 && Math.abs(this.vx) > 6) return this.vx;
    return this.facing * CRAWLER_WALK_SPEED;
  }

  flipPatrolDirection(): void {
    this.facing *= -1;
    if (this.onGround && this.jumpsquat === 0) {
      this.vx = this.facing * CRAWLER_WALK_SPEED;
    }
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  isJumpSquatting(): boolean {
    return this.jumpsquat > 0;
  }

  canServeAsPeerPlatform(): boolean {
    return !this.isDead() && !this.isInCombatHitstun();
  }

  isKuriboStompCorpseActive(): boolean {
    return this.kuriboStompCorpseSec > 0;
  }

  collisionPoseAt(ax: number, ay: number): HitboxPose {
    if (this.usesHopCollisionHull()) {
      return this.crawlerPose(ENEMY_CRAWLER_HOP_LOCAL, ENEMY_CRAWLER_HOP_PIVOT_X, ax, ay);
    }
    return this.crawlerPose(ENEMY_CRAWLER_LOCAL, ENEMY_CRAWLER_PIVOT_X, ax, ay);
  }

  setPeerCarrierForTick(carrier: CombatEnemy | null): void {
    this.peerCarrierThisTick = carrier;
  }

  peerCarrierForTick(): CombatEnemy | null {
    return this.peerCarrierThisTick;
  }

  applyPeerRidingVelocity(carrierVx: number, carrierVy: number): void {
    this.vx = carrierVx;
    this.vy = carrierVy;
  }

  private applyGravity(dt: number): void {
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;
  }

  private moveAndCollide(
    dt: number,
    map: TileMap,
    peers: readonly CombatEnemy[],
  ): boolean {
    this.horizontalWallResolvedThisStep = false;
    const poseAt = (ax: number, ay: number) => this.collisionPoseAt(ax, ay);
    const xBefore = this.x;
    this.x += this.vx * dt;
    const horz = resolveHorizontalPolygonEnemy(
      map,
      poseAt,
      xBefore,
      this.x,
      this.y,
      this.vx,
    );
    this.x = horz.x;
    this.vx = horz.vx;
    this.horizontalWallResolvedThisStep = horz.wallResolved;

    const before = this.hitboxPose().bounds();
    const prevBottom = before.y + before.h;
    const prevTop = before.y;
    this.y += this.vy * dt;
    this.onGround = false;

    const vert = resolveVerticalCrawler(
      map,
      () => this.rect(),
      this,
      peers,
      this.y,
      this.vy,
      prevBottom,
      prevTop,
    );
    this.y = vert.y;
    this.vy = vert.vy;
    this.onGround = vert.onGround;
    return vert.landed;
  }
}
