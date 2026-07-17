import {
  aabbOverlap,
  knockbackFor,
  knockbackForFrisbee,
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
import {
  ENEMY_ROLLING_HEAD_HIT_LOCAL,
  ENEMY_ROLLING_HEAD_HIT_PIVOT_X,
  ENEMY_ROLLING_HEAD_HURT_LOCAL,
  ENEMY_ROLLING_HEAD_HURT_PIVOT_X,
  ENEMY_ROLLING_HEAD_LOCAL,
  ENEMY_ROLLING_HEAD_PIVOT_X,
} from "../config/HitboxValues";
import {
  embeddedAsideFromFootprintFloor,
  polygonOverlapsCeilingSolidTiles,
  polygonOverlapsFloorBlockingTiles,
  polygonOverlapsSolidWallTiles,
} from "../collision/EnemyCollision";
import { tryResolveIceHorizontal, tryResolveIceVertical } from "../collision/EnemyIceSolids";
import { HitboxPose } from "../collision/HitboxPose";
import { nudgePositionOutOfSolidTiles } from "../physics/SolidOverlap";
import { GRAVITY, MAX_FALL, TILE_SEPARATION_ITERATIONS } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { landingSurfaceY, PEER_STAND_EPS_PX } from "./EnemyPeerPlatforms";
import { Possessed } from "./Possessed";
import { Nephilim } from "./Nephilim";
import { SquashStretch } from "../render/SquashStretch";
import { HURT_TINT_PEAK_ALPHA, HURT_TINT_SECONDS } from "../combat/HitlagState";

const TRAVEL_SPEED = 32;
const PENISMAN_WALK_SPEED = 28;
const PENISMAN_AIR_FRAME_SEC = 0.1;
const SPAWN_HEIGHT_TILES = 5;
const SPAWN_FLOOR_EPS_PX = 0.5;
const COLLISION_FEET_LOCAL_Y = 13;
const ANIM_FRAME_COUNT = 4;
const BOUNCE_SQUASH_FRAMES = 10;
const BOUNCE_SQUASH_PEAK = 1.65;
const MIN_BOUNCE_VY = 120;

type BounceSquashKind = "none" | "floor" | "wall" | "ceiling";

const MIN_PEER_OVERLAP_PX = 0.25;

/**
 * Elastic-bounce room enemy (Java RollingHead.java / rolling head cc.png).
 */
export class RollingHead implements CombatEnemy {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  onGround = false;
  patrolDir = -1;
  hp: number;
  readonly maxHp: number;

  private knockbackTravelActive = false;
  private airborneTravelSpeed = TRAVEL_SPEED;
  private hurtLocked = false;
  private knockbackLandingSquashPending = false;
  private animFrame = 0;
  private animAccum = 0;
  hitstun = 0;
  private bounceSquashFramesRemaining = 0;
  private bounceResumeVx = 0;
  private bounceResumeVy = 0;
  private bounceSquashKind: BounceSquashKind = "none";
  private pendingKnockVx = 0;
  private pendingKnockVy = 0;
  private pendingCorpseExplosion = false;

  readonly squash = new SquashStretch();
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  hitlagSolidRed = false;
  hitlagElectrocute = false;
  private hurtTintRemaining = 0;
  readonly blackHeartBeat = new BlackHeartBeatDeferral();

  constructor(x: number, y: number, maxHp: number) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  static spawnBouncing(
    anchorX: number,
    groundTopWorldY: number,
    maxHp: number,
    playerCenterX?: number,
  ): RollingHead {
    const y =
      groundTopWorldY -
      COLLISION_FEET_LOCAL_Y -
      SPAWN_HEIGHT_TILES * TILE_SIZE -
      SPAWN_FLOOR_EPS_PX;
    const rh = new RollingHead(anchorX, y, maxHp);
    if (playerCenterX != null) rh.faceToward(playerCenterX);
    return rh;
  }

  faceToward(playerCenterX: number): void {
    const br = this.rect();
    const cx = br.x + br.w * 0.5;
    if (playerCenterX > cx + 1) this.patrolDir = 1;
    else if (playerCenterX < cx - 1) this.patrolDir = -1;
  }

  private collisionFacingSign(): number {
    return -this.patrolDir;
  }

  getAnimFrame(): number {
    return this.animFrame;
  }

  update(dt: number, map: TileMap, _playerX: number, roomEnemies: readonly CombatEnemy[] = []): void {
    if (this.hurtTintRemaining > 0) {
      this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    }

    if (this.hp <= 0) {
      if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
        const hadHitstun = this.hitstun > 0;
        tickBlackHeartEnemyHitstun(dt, this);
        if (hadHitstun && this.hitstun <= 0 && !this.blackHeartBeat.isLocked()) {
          this.pendingCorpseExplosion = true;
        }
      }
      return;
    }

    if (this.bounceSquashFramesRemaining > 0) {
      this.squash.tick(dt);
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.tickAnim(dt);
      this.bounceSquashFramesRemaining--;
      if (this.bounceSquashFramesRemaining === 0) {
        this.vx = this.bounceResumeVx;
        this.vy = this.bounceResumeVy;
        this.syncPatrolDirFromHorizontalMotion(this.bounceResumeVx);
        this.applyBounceSquashReleaseStretch();
        this.hurtLocked = false;
        this.bounceSquashKind = "none";
      }
      return;
    }

    this.squash.tick(dt);

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

    const wasAirborneBeforeMove = !this.onGround || this.knockbackLandingSquashPending;
    this.onGround = this.isGrounded(map, roomEnemies);

    if (!this.hurtLocked) this.applyPatrolTravelVx();

    const vyBeforeGravity = this.vy;
    this.vy += GRAVITY * dt;
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;

    const landed = this.moveAndCollide(dt, map, roomEnemies);
    if (this.bounceSquashFramesRemaining > 0) {
      this.tickAnim(dt);
      return;
    }
    if (landed && wasAirborneBeforeMove && vyBeforeGravity > 0) {
      this.knockbackLandingSquashPending = false;
    }

    this.onGround = this.isGrounded(map, roomEnemies);
    this.tickAnim(dt);
  }

  private rollingPose(
    local: ReadonlyArray<number>,
    pivotLocalX: number,
    ax = this.x,
    ay = this.y,
  ): HitboxPose {
    return new HitboxPose(local, ax, ay, this.collisionFacingSign(), pivotLocalX);
  }

  hitboxPose(): HitboxPose {
    return this.rollingPose(ENEMY_ROLLING_HEAD_LOCAL, ENEMY_ROLLING_HEAD_PIVOT_X);
  }

  rect(): Aabb {
    return this.hitboxPose().bounds();
  }

  contactDamagePose(): Aabb {
    return this.rollingPose(ENEMY_ROLLING_HEAD_HIT_LOCAL, ENEMY_ROLLING_HEAD_HIT_PIVOT_X).bounds();
  }

  damageReceivePose(): Aabb {
    return this.rollingPose(ENEMY_ROLLING_HEAD_HURT_LOCAL, ENEMY_ROLLING_HEAD_HURT_PIVOT_X).bounds();
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.isDead()) return false;
    return this.rollingPose(ENEMY_ROLLING_HEAD_HURT_LOCAL, ENEMY_ROLLING_HEAD_HURT_PIVOT_X).intersectsRect(
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
    const away = this.rect().x + this.rect().w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = knockbackFor(strike.knockKind, away);
    this.pendingKnockVx = this.vx + kb.vx;
    this.pendingKnockVy = this.vy + kb.vy;
    this.vx = 0;
    this.vy = 0;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
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
    const kb = knockbackForFrisbee(strike.projectileVelX);
    this.pendingKnockVx = this.vx + kb.vx;
    this.pendingKnockVy = this.vy + kb.vy;
    this.vx = 0;
    this.vy = 0;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.isDead() || this.hitstun > 0 || this.blackHeartBeat.isLocked() || this.hurtLocked) {
      return false;
    }
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

  isDead(): boolean {
    return this.hp <= 0 && this.hitstun <= 0;
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
    return this.collisionFacingSign();
  }

  facingHintVelX(): number {
    if (this.hurtLocked) {
      if (Math.abs(this.vx) > 6) return this.vx;
      return this.patrolDir;
    }
    return this.patrolDir * this.currentAirborneTravelSpeed();
  }

  flipPatrolDirection(): void {
    this.patrolDir *= -1;
    if (!this.onGround && !this.hurtLocked) {
      this.vx = this.patrolDir * this.currentAirborneTravelSpeed();
    } else if (!this.onGround && this.hurtLocked && Math.abs(this.vx) > 1e-3) {
      this.vx = -this.vx;
    }
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
  }

  takeCorpseExplosion(): boolean {
    if (!this.pendingCorpseExplosion) return false;
    this.pendingCorpseExplosion = false;
    return true;
  }

  collisionPoseAt(ax: number, ay: number): HitboxPose {
    return this.rollingPose(ENEMY_ROLLING_HEAD_LOCAL, ENEMY_ROLLING_HEAD_PIVOT_X, ax, ay);
  }

  private finishHitstunKnockRelease(): void {
    if (this.hp <= 0) return;
    this.vx = this.pendingKnockVx;
    this.vy = this.pendingKnockVy;
    this.pendingKnockVx = 0;
    this.pendingKnockVy = 0;
    this.adoptKnockbackTravel(this.vx);
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    this.hurtLocked = true;
    this.knockbackLandingSquashPending = true;
  }

  private adoptKnockbackTravel(horizontalVx: number): void {
    this.knockbackTravelActive = true;
    this.syncPatrolDirFromHorizontalMotion(horizontalVx);
    if (Math.abs(horizontalVx) > 6) this.airborneTravelSpeed = Math.abs(horizontalVx);
  }

  private syncPatrolDirFromHorizontalMotion(horizontalVx: number): void {
    if (Math.abs(horizontalVx) > 6) this.patrolDir = horizontalVx >= 0 ? 1 : -1;
  }

  private currentAirborneTravelSpeed(): number {
    return this.knockbackTravelActive ? this.airborneTravelSpeed : TRAVEL_SPEED;
  }

  private applyPatrolTravelVx(): void {
    if (this.onGround) this.vx = 0;
    else this.vx = this.patrolDir * this.currentAirborneTravelSpeed();
  }

  private beginBounceSquash(
    kind: BounceSquashKind,
    resumeVx: number,
    resumeVy: number,
    applySquash: () => void,
  ): void {
    this.bounceSquashKind = kind;
    this.bounceResumeVx = resumeVx;
    this.bounceResumeVy = resumeVy;
    this.bounceSquashFramesRemaining = BOUNCE_SQUASH_FRAMES;
    this.vx = 0;
    this.vy = 0;
    applySquash();
  }

  private applyBounceSquashReleaseStretch(): void {
    if (this.bounceSquashKind === "floor") {
      this.squash.applyStretchY(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES);
    } else if (this.bounceSquashKind === "ceiling") {
      this.squash.applyStretchX(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES);
    }
  }

  private upwardBounceVy(impactVyDown: number): number {
    return -Math.max(Math.abs(impactVyDown), MIN_BOUNCE_VY);
  }

  private downwardBounceVy(impactVyUp: number): number {
    return Math.max(Math.abs(impactVyUp), MIN_BOUNCE_VY);
  }

  private onFloorBounce(): void {
    const impactVy = this.vy;
    const resumeVx = this.knockbackTravelActive ? this.patrolDir * this.airborneTravelSpeed : 0;
    const resumeVy = this.upwardBounceVy(impactVy);
    this.beginBounceSquash("floor", resumeVx, resumeVy, () => {
      this.squash.applyStretchX(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES);
    });
  }

  private tickAnim(dt: number): void {
    if (this.squash.active()) return;
    const speedRef = Math.max(Math.abs(this.vx), TRAVEL_SPEED * 0.25);
    const frameSeconds = PENISMAN_AIR_FRAME_SEC * (PENISMAN_WALK_SPEED / speedRef);
    this.animAccum += dt;
    while (this.animAccum >= frameSeconds) {
      this.animAccum -= frameSeconds;
      this.animFrame = (this.animFrame + 1) % ANIM_FRAME_COUNT;
    }
  }

  private moveAndCollide(
    dt: number,
    map: TileMap,
    peers: readonly CombatEnemy[],
  ): boolean {
    const poseAt = (ax: number, ay: number) =>
      this.rollingPose(ENEMY_ROLLING_HEAD_LOCAL, ENEMY_ROLLING_HEAD_PIVOT_X, ax, ay);

    const xBefore = this.x;
    this.x += this.vx * dt;
    this.resolveHorizontalElastic(map, poseAt, xBefore);
    const iceH = tryResolveIceHorizontal(poseAt(this.x, this.y), this.vx);
    if (iceH) {
      this.x += iceH.deltaX;
      const impactVx = this.vx;
      const resumeVx = -impactVx;
      const resumeVy = this.vy;
      this.patrolDir = resumeVx >= 0 ? 1 : -1;
      const wallSide = impactVx > 0 ? 1 : -1;
      this.beginBounceSquash("wall", resumeVx, resumeVy, () => {
        this.squash.applyStretchYWallAnchored(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES, wallSide);
      });
    }

    const before = poseAt(this.x, this.y).bounds();
    const prevBottom = before.y + before.h;
    const prevTop = before.y;
    const yBefore = this.y;
    this.y += this.vy * dt;
    let landed = this.resolveVerticalElastic(map, peers, poseAt, yBefore, prevBottom, prevTop);
    const iceV = tryResolveIceVertical(poseAt(this.x, this.y), this.vy, prevBottom, prevTop, landed);
    if (iceV) {
      this.y += iceV.deltaY;
      if (iceV.landed) {
        this.onFloorBounce();
        landed = true;
      } else {
        const resumeVy = this.downwardBounceVy(this.vy);
        this.beginBounceSquash("ceiling", this.vx, resumeVy, () => {
          this.squash.applyStretchY(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES);
        });
      }
    }
    this.resolvePeerBounces(peers);

    if (embeddedAsideFromFootprintFloor(map, poseAt, this.x, this.y)) {
      const nudged = nudgePositionOutOfSolidTiles(map, this.x, this.y, poseAt, 2, 96);
      this.x = nudged.x;
      this.y = nudged.y;
    }
    return landed;
  }

  private resolveHorizontalElastic(
    map: TileMap,
    poseAt: (ax: number, ay: number) => HitboxPose,
    xBefore: number,
  ): void {
    if (Math.abs(this.vx) < 1e-6) return;
    if (!polygonOverlapsSolidWallTiles(poseAt(this.x, this.y), map)) return;

    let lo = Math.min(xBefore, this.x);
    let hi = Math.max(xBefore, this.x);
    for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
      const mid = (lo + hi) * 0.5;
      if (polygonOverlapsSolidWallTiles(poseAt(mid, this.y), map)) {
        if (this.vx > 0) hi = mid;
        else lo = mid;
      } else if (this.vx > 0) lo = mid;
      else hi = mid;
    }
    this.x = this.vx > 0 ? lo : hi;
    const impactVx = this.vx;
    const resumeVx = -impactVx;
    const resumeVy = this.vy;
    this.patrolDir = resumeVx >= 0 ? 1 : -1;
    const wallSide = impactVx > 0 ? 1 : -1;
    this.beginBounceSquash("wall", resumeVx, resumeVy, () => {
      this.squash.applyStretchYWallAnchored(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES, wallSide);
    });
  }

  private resolveVerticalElastic(
    map: TileMap,
    peers: readonly CombatEnemy[],
    poseAt: (ax: number, ay: number) => HitboxPose,
    yBefore: number,
    prevBottom: number,
    prevTop: number,
  ): boolean {
    if (this.vy > 0) {
      if (!polygonOverlapsFloorBlockingTiles(poseAt(this.x, this.y), map, prevBottom)) {
        const peerTop = landingSurfaceY(this, peers, prevBottom);
        if (!Number.isNaN(peerTop)) {
          const bottom = poseAt(this.x, this.y).bounds().y + poseAt(this.x, this.y).bounds().h;
          this.y += peerTop - bottom;
          this.onFloorBounce();
          return true;
        }
        return false;
      }
      let lo = Math.min(yBefore, this.y);
      let hi = Math.max(yBefore, this.y);
      for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
        const mid = (lo + hi) * 0.5;
        if (polygonOverlapsFloorBlockingTiles(poseAt(this.x, mid), map, prevBottom)) hi = mid;
        else lo = mid;
      }
      this.y = lo;
      this.onFloorBounce();
      return true;
    }
    if (this.vy < 0) {
      if (!polygonOverlapsCeilingSolidTiles(poseAt(this.x, this.y), map)) return false;
      const nextTop = poseAt(this.x, this.y).bounds().y;
      const topTile = Math.floor((nextTop + 1e-4) / TILE_SIZE);
      const ceilingBottomY = (topTile + 1) * TILE_SIZE;
      if (prevTop < ceilingBottomY - 1e-3) return false;
      let lo = Math.min(yBefore, this.y);
      let hi = Math.max(yBefore, this.y);
      for (let i = 0; i < TILE_SEPARATION_ITERATIONS; i++) {
        const mid = (lo + hi) * 0.5;
        if (polygonOverlapsCeilingSolidTiles(poseAt(this.x, mid), map)) lo = mid;
        else hi = mid;
      }
      this.y = hi;
      const impactVy = this.vy;
      const resumeVy = this.downwardBounceVy(impactVy);
      this.beginBounceSquash("ceiling", this.vx, resumeVy, () => {
        this.squash.applyStretchY(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES);
      });
    }
    return false;
  }

  private resolvePeerBounces(peers: readonly CombatEnemy[]): void {
    if (peers.length < 2) return;
    let selfBounds = this.rect();
    for (const other of peers) {
      if (other === this || other.isDead() || other.isInCombatHitstun()) continue;
      if (other instanceof Possessed || other instanceof Nephilim) continue;
      const ob = other.rect();
      if (!aabbOverlap(selfBounds, ob)) continue;
      const overlapX = Math.min(selfBounds.x + selfBounds.w, ob.x + ob.w) - Math.max(selfBounds.x, ob.x);
      const overlapY = Math.min(selfBounds.y + selfBounds.h, ob.y + ob.h) - Math.max(selfBounds.y, ob.y);
      if (overlapX < MIN_PEER_OVERLAP_PX || overlapY < MIN_PEER_OVERLAP_PX) continue;
      const selfCx = selfBounds.x + selfBounds.w * 0.5;
      const otherCx = ob.x + ob.w * 0.5;
      if (overlapX <= overlapY) {
        const impactVx = this.vx;
        if (Math.abs(impactVx) > 1e-3) {
          const resumeVx = -impactVx;
          this.patrolDir = resumeVx >= 0 ? 1 : -1;
          const wallSide = selfCx < otherCx ? 1 : -1;
          this.beginBounceSquash("wall", resumeVx, this.vy, () => {
            this.squash.applyStretchYWallAnchored(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES, wallSide);
          });
        }
        const half = overlapX * 0.5 + 0.01;
        this.x += selfCx < otherCx ? -half : half;
      } else {
        if (this.vy > 0) this.onFloorBounce();
        else if (this.vy < 0) {
          const resumeVy = this.downwardBounceVy(this.vy);
          this.beginBounceSquash("ceiling", this.vx, resumeVy, () => {
            this.squash.applyStretchY(BOUNCE_SQUASH_PEAK, BOUNCE_SQUASH_FRAMES);
          });
        }
        const half = overlapY * 0.5 + 0.01;
        const selfCy = selfBounds.y + selfBounds.h * 0.5;
        const otherCy = ob.y + ob.h * 0.5;
        this.y += selfCy < otherCy ? -half : half;
      }
      selfBounds = this.rect();
    }
  }

  private isGrounded(map: TileMap, peers: readonly CombatEnemy[]): boolean {
    if (this.bounceSquashFramesRemaining > 0 || this.vy < 0) return false;
    const r = this.rect();
    const probeY = r.y + r.h + 0.5;
    const leftTile = Math.floor((r.x + 0.001) / TILE_SIZE);
    const rightTile = Math.floor((r.x + r.w - 0.001) / TILE_SIZE);
    const ty = Math.floor(probeY / TILE_SIZE);
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map.isSolidTile(tx, ty) || map.isPlatformTile(tx, ty)) return true;
    }
    const peerTop = landingSurfaceY(this, peers, r.y + r.h);
    return !Number.isNaN(peerTop) && r.y + r.h >= peerTop - PEER_STAND_EPS_PX;
  }
}
