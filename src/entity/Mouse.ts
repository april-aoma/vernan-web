import {
  aabbOverlap,
  knockbackFor,
  knockbackForFrisbee,
  knockbackForPsychicDebris,
  type Aabb,
  type ProjectileStrike,
  type WeaponStrike,
} from "../combat/CombatMath";
import { seesPlayerAt, type PlayerCombatSnapshot } from "../combat/EnemyVision";
import {
  MOUSE_H,
  MOUSE_MAX_HP,
  MOUSE_PATROL_FLIP_COOLDOWN_SEC,
  MOUSE_SUPPRESS_LEDGE_AFTER_WALL_SEC,
  MOUSE_W,
  MOUSE_WALK_SPEED_DAMAGED,
  MOUSE_WALK_SPEED_DORMANT,
  MOUSE_WALK_SPEED_FULL,
} from "../config/CombatStats";
import {
  ENEMY_MOUSE_HIT_LOCAL,
  ENEMY_MOUSE_HIT_PIVOT_X,
  ENEMY_MOUSE_HURT_LOCAL,
  ENEMY_MOUSE_HURT_PIVOT_X,
  ENEMY_MOUSE_LOCAL,
  ENEMY_MOUSE_PIVOT_X,
} from "../config/HitboxValues";
import { HitboxPose } from "../collision/HitboxPose";
import { GRAVITY, MAX_FALL, PLATFORM_DECK_SLACK_PX } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import {
  isGrounded,
  landingSurfaceY,
  solidUnderFootAhead,
} from "./EnemyPeerPlatforms";
import type { PeerWalkingEnemy } from "./PeerWalkingEnemy";
import type { PeerRidingBehavior } from "./PeerRidingBehavior";
import { SquashStretch } from "../render/SquashStretch";
import {
  DEFAULT_SHAKE_AMPLITUDE_PX,
  HURT_TINT_PEAK_ALPHA,
  HURT_TINT_SECONDS,
  sampleShake,
} from "../combat/HitlagState";
import {
  createPatrolWallFlipState,
  tickWallFlipReady,
} from "./EnemyPatrolWallFlip";

/**
 * Slim Mouse (Java Mouse.java).
 * Dormant half-speed ledge patrol → activate on vision → full/damaged speed, falls off ledges.
 * Contact damage only when activated. Art faces left (collision/draw facing = −patrolDir).
 */
export class Mouse implements PeerWalkingEnemy {
  x: number;
  y: number;
  w = MOUSE_W;
  h = MOUSE_H;
  vx = 0;
  vy = 0;
  onGround = false;
  /** Patrol / walk direction (−1 left, +1 right); sprite follows this. */
  patrolDir = -1;
  hp: number;
  readonly maxHp: number;

  private activated = false;
  private hitstun = 0;
  private hurtLocked = false;
  private animFrame = 0;
  private animAccum = 0;
  private pendingCorpseExplosion = false;
  private horizontalWallResolvedThisStep = false;
  private patrolFlipCooldownSec = 0;
  private suppressLedgeFlipRemainSec = 0;
  private readonly patrolWallFlipState = createPatrolWallFlipState();
  private knockbackLandingSquashPending = false;
  private peerCarryAnchorX = 0;
  private peerCarryAnchorY = 0;
  private peerCarrierThisTick: CombatEnemy | null = null;

  readonly squash = new SquashStretch();
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  hitlagSolidRed = false;
  private hurtTintRemaining = 0;

  constructor(x: number, y: number, maxHp = MOUSE_MAX_HP) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  /** Hulls traced facing left; negate patrolDir so flip matches sprite. */
  private collisionFacingSign(): number {
    return -this.patrolDir;
  }

  getAnimFrame(): number {
    return this.animFrame;
  }

  isActivated(): boolean {
    return this.activated;
  }

  /** Damaged strip when below max HP (Java mouseWalkSpriteFrame). */
  useHurtSprite(): boolean {
    return this.hp < this.maxHp;
  }

  applyVision(player: PlayerCombatSnapshot, seeRadius: number): void {
    const br = this.rect();
    const nowSees = seesPlayerAt(
      br.x + br.w * 0.5,
      br.y + br.h * 0.5,
      player.cx,
      player.cy,
      seeRadius,
    );
    if (nowSees) {
      if (!this.activated) this.faceToward(player.cx);
      this.activated = true;
    }
  }

  /** Initial patrol faces Vernan's center (call once at spawn / wake). */
  faceToward(playerCenterX: number): void {
    const br = this.rect();
    const cx = br.x + br.w * 0.5;
    if (playerCenterX > cx + 1) this.patrolDir = 1;
    else if (playerCenterX < cx - 1) this.patrolDir = -1;
  }

  private isFacingToward(playerCenterX: number): boolean {
    const br = this.rect();
    const cx = br.x + br.w * 0.5;
    if (playerCenterX > cx + 1) return this.patrolDir > 0;
    if (playerCenterX < cx - 1) return this.patrolDir < 0;
    return false;
  }

  /** Dormant mice always turn at ledges; activated only when not walking toward Vernan. */
  private shouldTurnAtLedge(playerCenterX: number): boolean {
    return !this.activated || !this.isFacingToward(playerCenterX);
  }

  private currentWalkSpeed(): number {
    if (!this.activated) return MOUSE_WALK_SPEED_DORMANT;
    if (this.hp <= this.maxHp * 0.5 + 1e-6) return MOUSE_WALK_SPEED_DAMAGED;
    return MOUSE_WALK_SPEED_FULL;
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
    this.patrolFlipCooldownSec = Math.max(0, this.patrolFlipCooldownSec - dt);
    this.suppressLedgeFlipRemainSec = Math.max(0, this.suppressLedgeFlipRemainSec - dt);

    // Java: corpse stays through hitstun, then queues explosion.
    if (this.hp <= 0) {
      if (this.hitstun > 0) {
        this.hitlagSolidRed = true;
        this.hitlagShakeX = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
        this.hitlagShakeY = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
        this.hitstun = Math.max(0, this.hitstun - dt);
        if (this.hitstun <= 0) {
          this.hitlagSolidRed = false;
          this.hitlagShakeX = 0;
          this.hitlagShakeY = 0;
          this.pendingCorpseExplosion = true;
        }
      }
      return;
    }

    if (this.hitstun > 0) {
      this.hitlagSolidRed = true;
      this.hitlagShakeX = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
      this.hitlagShakeY = sampleShake(DEFAULT_SHAKE_AMPLITUDE_PX);
      this.hitstun = Math.max(0, this.hitstun - dt);
      if (this.hitstun <= 0) {
        this.hitlagSolidRed = false;
        this.hitlagShakeX = 0;
        this.hitlagShakeY = 0;
        this.hurtTintRemaining = HURT_TINT_SECONDS;
        this.hurtLocked = true;
        this.knockbackLandingSquashPending = true;
      }
      this.applyGravity(dt);
      this.moveAndCollide(dt, map, roomEnemies);
      return;
    }
    this.hitlagSolidRed = false;
    this.hitlagShakeX = 0;
    this.hitlagShakeY = 0;

    const wasAirborneBeforeMove = !this.onGround || this.knockbackLandingSquashPending;
    this.onGround = isGrounded(this, map, roomEnemies);

    if (!this.hurtLocked && this.onGround) {
      this.vx = this.patrolDir * this.currentWalkSpeed();
    }

    this.applyGravity(dt);
    const impactVy = this.vy;
    const landed = this.moveAndCollide(dt, map, roomEnemies);
    this.onGround = isGrounded(this, map, roomEnemies);

    if (landed && wasAirborneBeforeMove) {
      this.squash.applyStretchX(1.2, Math.abs(impactVy) >= 24 ? 20 : 5);
      this.knockbackLandingSquashPending = false;
    }
    if (this.hurtLocked && landed) {
      this.hurtLocked = false;
    }

    const wallPatrolFlip = tickWallFlipReady(
      this.patrolWallFlipState,
      this.rect(),
      map,
      this.patrolDir,
      this.horizontalWallResolvedThisStep,
      this.patrolFlipCooldownSec <= 0,
    );

    if (solidUnderFootAhead(this, map, roomEnemies, this.patrolDir)) {
      this.suppressLedgeFlipRemainSec = 0;
    }

    if (!this.hurtLocked && this.onGround && this.patrolFlipCooldownSec <= 0) {
      if (this.shouldTurnAtLedge(playerX) && !solidUnderFootAhead(this, map, roomEnemies, this.patrolDir)) {
        if (this.suppressLedgeFlipRemainSec <= 0) {
          this.patrolDir *= -1;
          this.patrolFlipCooldownSec = MOUSE_PATROL_FLIP_COOLDOWN_SEC;
          if (this.onGround) this.vx = this.patrolDir * this.currentWalkSpeed();
        }
      } else if (wallPatrolFlip) {
        this.patrolDir *= -1;
        this.patrolFlipCooldownSec = MOUSE_PATROL_FLIP_COOLDOWN_SEC;
        this.suppressLedgeFlipRemainSec = MOUSE_SUPPRESS_LEDGE_AFTER_WALL_SEC;
        if (this.onGround) this.vx = this.patrolDir * this.currentWalkSpeed();
      }
    }

    this.tickAnim(dt);
  }

  private tickAnim(dt: number): void {
    const frameSeconds = this.onGround ? 0.14 : 0.1;
    this.animAccum += dt;
    while (this.animAccum >= frameSeconds) {
      this.animAccum -= frameSeconds;
      this.animFrame = (this.animFrame + 1) % 4;
    }
  }

  private mousePose(
    local: ReadonlyArray<number>,
    pivotLocalX: number,
    ax = this.x,
    ay = this.y,
  ): HitboxPose {
    return new HitboxPose(local, ax, ay, this.collisionFacingSign(), pivotLocalX);
  }

  hitboxPose(): HitboxPose {
    return this.mousePose(ENEMY_MOUSE_LOCAL, ENEMY_MOUSE_PIVOT_X);
  }

  rect(): Aabb {
    return this.hitboxPose().bounds();
  }

  contactDamagePose(): Aabb {
    return this.mousePose(ENEMY_MOUSE_HIT_LOCAL, ENEMY_MOUSE_HIT_PIVOT_X).bounds();
  }

  damageReceivePose(): Aabb {
    return this.mousePose(ENEMY_MOUSE_HURT_LOCAL, ENEMY_MOUSE_HURT_PIVOT_X).bounds();
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.isDead()) return false;
    return this.mousePose(ENEMY_MOUSE_HURT_LOCAL, ENEMY_MOUSE_HURT_PIVOT_X).intersectsRect(sword);
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.hp <= 0 || this.hitstun > 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    const r = this.rect();
    const away =
      r.x + r.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = knockbackFor(strike.knockKind, away);
    this.vx = kb.vx;
    this.vy = kb.vy;
    this.onGround = false;
    return true;
  }

  intersectsProjectile(projectile: HitboxPose): boolean {
    if (this.isDead()) return false;
    return projectile.intersectsRect(this.damageReceivePose());
  }

  applyProjectileStrike(strike: ProjectileStrike): boolean {
    if (this.hp <= 0 || this.hitstun > 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
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
      this.vx = kb.vx;
      this.vy = kb.vy;
    } else {
      const kb = knockbackForFrisbee(strike.projectileVelX);
      this.vx = kb.vx;
      this.vy = kb.vy;
    }
    this.onGround = false;
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.isDead() || this.hitstun > 0 || this.hurtLocked) return false;
    if (!this.activated) return false;
    return aabbOverlap(playerHurt, this.contactDamagePose());
  }

  contactDamageToPlayer(): number {
    return 1;
  }

  getHealth(): number {
    return this.hp;
  }

  getMaxHealth(): number {
    return this.maxHp;
  }

  /** Dead only after hitstun ends (Java Mouse.isDead). */
  isDead(): boolean {
    return this.hp <= 0 && this.hitstun <= 0;
  }

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
    return this.hitstun > 0;
  }

  /** Draw facing: art faces left; +patrolDir mirrors (Java faceRight). */
  facingSign(): number {
    return -this.patrolDir;
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
  }

  peerRidingBehavior(): PeerRidingBehavior {
    return "full_ai";
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
    return this.patrolDir * this.currentWalkSpeed();
  }

  flipPatrolDirection(): void {
    this.patrolDir *= -1;
    this.patrolFlipCooldownSec = MOUSE_PATROL_FLIP_COOLDOWN_SEC;
    this.suppressLedgeFlipRemainSec = MOUSE_SUPPRESS_LEDGE_AFTER_WALL_SEC;
    if (this.onGround && !this.hurtLocked) {
      this.vx = this.patrolDir * this.currentWalkSpeed();
    }
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  isJumpSquatting(): boolean {
    return false;
  }

  canServeAsPeerPlatform(): boolean {
    return !this.isDead() && !this.isInCombatHitstun();
  }

  isKuriboStompCorpseActive(): boolean {
    return false;
  }

  collisionPoseAt(ax: number, ay: number): HitboxPose {
    return this.mousePose(ENEMY_MOUSE_LOCAL, ENEMY_MOUSE_PIVOT_X, ax, ay);
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

  /**
   * Foot-row walkable floor slabs must not count as side walls (spawn H=12 vs hull bottom
   * local Y=13 leaves mice 1px in the floor; treating that as a wall caused flip oscillation).
   */
  private isHorizontalBlockingSolid(map: TileMap, tx: number, ty: number, footRow: number): boolean {
    if (!map.isSolidTile(tx, ty)) return false;
    if (ty === footRow && !map.isSolidTile(tx, footRow - 1)) return false;
    return true;
  }

  private moveAndCollide(
    dt: number,
    map: TileMap,
    peers: readonly CombatEnemy[],
  ): boolean {
    this.horizontalWallResolvedThisStep = false;
    const xBefore = this.x;
    this.x += this.vx * dt;
    this.horizontalWallResolvedThisStep = this.resolveHorizontal(map, xBefore);
    const before = this.hitboxPose().bounds();
    const prevFoot = before.y + before.h;
    const prevTop = before.y;
    this.y += this.vy * dt;
    this.onGround = false;
    return this.resolveVertical(map, peers, prevFoot, prevTop);
  }

  private resolveHorizontal(map: TileMap, xBefore: number): boolean {
    if (this.vx === 0) return false;
    const r = this.rect();
    const ts = TILE_SIZE;
    const topTile = Math.floor((r.y + 0.001) / ts);
    const bottomTile = Math.floor((r.y + r.h - 0.001) / ts);
    const footRow = Math.floor((r.y + r.h - 1.0) / ts);

    if (this.vx > 0) {
      const prevB = this.mousePose(ENEMY_MOUSE_LOCAL, ENEMY_MOUSE_PIVOT_X, xBefore, this.y).bounds();
      const prevRight = prevB.x + prevB.w;
      const prevRightTile = Math.floor((prevRight - 1e-6) / ts);
      const newRightTile = Math.floor((r.x + r.w) / ts);
      for (let tx = Math.max(prevRightTile, 0); tx <= newRightTile; tx++) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (!this.isHorizontalBlockingSolid(map, tx, ty, footRow)) continue;
          const cr = this.rect();
          this.x += tx * ts - (cr.x + cr.w);
          this.vx = 0;
          return true;
        }
      }
    } else {
      const prevLeft = this.mousePose(
        ENEMY_MOUSE_LOCAL,
        ENEMY_MOUSE_PIVOT_X,
        xBefore,
        this.y,
      ).bounds().x;
      const prevLeftTile = Math.floor(prevLeft / ts);
      const newLeftTile = Math.floor(r.x / ts);
      for (let tx = prevLeftTile; tx >= newLeftTile; tx--) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (!this.isHorizontalBlockingSolid(map, tx, ty, footRow)) continue;
          const cr = this.rect();
          this.x += (tx + 1) * ts - cr.x;
          this.vx = 0;
          return true;
        }
      }
    }
    return false;
  }

  private resolveVertical(
    map: TileMap,
    peers: readonly CombatEnemy[],
    prevFoot: number,
    prevTop: number,
  ): boolean {
    if (this.vy >= 0) {
      const b = this.hitboxPose().bounds();
      const foot = b.y + b.h;
      const left = Math.floor((b.x + 0.001) / TILE_SIZE);
      const right = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
      const bottomTile = Math.floor((foot - 1e-4) / TILE_SIZE);
      for (let tx = left; tx <= right; tx++) {
        if (!map.isSolidTile(tx, bottomTile) && !map.isPlatformTile(tx, bottomTile)) continue;
        const floorY = bottomTile * TILE_SIZE;
        const prevBottomTile = Math.floor((prevFoot - 1e-4) / TILE_SIZE);
        const crossedFromAbove = prevFoot <= floorY + 1e-3 || prevBottomTile < bottomTile;
        const embedded = foot > floorY + 1e-3 && foot <= floorY + TILE_SIZE;
        if ((crossedFromAbove || embedded) && foot >= floorY - 1e-3) {
          if (map.isPlatformTile(tx, bottomTile) && foot > floorY + PLATFORM_DECK_SLACK_PX) {
            continue;
          }
          this.y += floorY - foot;
          this.vy = 0;
          this.onGround = true;
          return crossedFromAbove;
        }
        return false;
      }
      const peerTop = landingSurfaceY(this, peers, prevFoot);
      if (!Number.isNaN(peerTop)) {
        const lr = this.rect();
        this.y += peerTop - (lr.y + lr.h);
        this.vy = 0;
        this.onGround = true;
        return true;
      }
    } else {
      const b = this.hitboxPose().bounds();
      const top = b.y;
      const left = Math.floor((b.x + 0.001) / TILE_SIZE);
      const right = Math.floor((b.x + b.w - 0.001) / TILE_SIZE);
      const topTile = Math.floor((top + 1e-4) / TILE_SIZE);
      const ceilingBottomY = (topTile + 1) * TILE_SIZE;
      for (let tx = left; tx <= right; tx++) {
        if (!map.isSolidTile(tx, topTile)) continue;
        if (prevTop >= ceilingBottomY - 1e-3 && top <= ceilingBottomY + 1e-3) {
          this.y += ceilingBottomY - top;
          this.vy = 0;
        }
        break;
      }
    }
    return false;
  }
}
