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
import { seesPlayerWithSolidLos } from "../combat/SolidLineOfSight";
import type { WorldRect } from "../combat/EnemyVision";
import {
  ENEMY_GOLDEN_ROACH_FLY_HIT_LOCAL,
  ENEMY_GOLDEN_ROACH_FLY_HIT_PIVOT_X,
  ENEMY_GOLDEN_ROACH_FLY_HURT_LOCAL,
  ENEMY_GOLDEN_ROACH_FLY_HURT_PIVOT_X,
  ENEMY_GOLDEN_ROACH_FLY_LOCAL,
  ENEMY_GOLDEN_ROACH_FLY_PIVOT_X,
  ENEMY_GOLDEN_ROACH_WALK_HURT_LOCAL,
  ENEMY_GOLDEN_ROACH_WALK_HURT_PIVOT_X,
  ENEMY_GOLDEN_ROACH_WALK_LOCAL,
  ENEMY_GOLDEN_ROACH_WALK_PIVOT_X,
} from "../config/HitboxValues";
import { HitboxPose } from "../collision/HitboxPose";
import { GRAVITY } from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { AmbientClusterMap } from "../world/AmbientClusterMap";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { SquashStretch } from "../render/SquashStretch";
import { HURT_TINT_PEAK_ALPHA, HURT_TINT_SECONDS } from "../combat/HitlagState";
import { JavaRandom } from "../util/JavaRandom";

export type GoldenRoachMode = "walk" | "fly";
type ChaseSwoopPhase = "none" | "pass" | "return";

const MAX_FALL = 6000;
const WALK_SPEED = 22;
const WALK_ACCEL = 260;
const FLY_ACCEL = 220;
const FLY_DECEL = 200;
const FLY_MAX_SPEED = 88;
const FLY_ARRIVE_RADIUS = 56;
const FLY_GRAVITY_MULT = 0.5;
const FLY_ANIM_FPS = 24;
const WALK_TILT_RAD = (60 * Math.PI) / 180;
const FLY_TILT_RAD = (45 * Math.PI) / 180;
const LAND_COOLDOWN_SEC = 5;
const SKITTER_MIN_SEC = 0.18;
const SKITTER_MAX_SEC = 0.85;
const IDLE_FLY_ROLL_PER_SEC = 0.06;
const CHASE_FLY_ROLL_PER_SEC = 0.27;
const MIN_FLY_SEC = 1.5;
const MAX_CHASE_FLY_SEC = 3;
const SWOOP_OVERSHOOT_PX = 80;
const SWOOP_LATERAL_PX = 48;
const SWOOP_PASS_CLEAR_PX = 28;
const FLY_CAMERA_MARGIN_PX = 16;
const TRANSITION_SQUASH_FRAMES = 10;
const TAKEOFF_STRETCH_Y = 1.2;
const LAND_STRETCH_X = 1.2;
const PROJECTILE_DAMAGE_MULT = 0.1;
const SEE_RADIUS_MULT = 0.75;
const EMPTY_AABB: Aabb = { x: 0, y: 0, w: 0, h: 0 };

function artRestBearingRadForMode(mode: GoldenRoachMode): number {
  const tilt = mode === "fly" ? FLY_TILT_RAD : WALK_TILT_RAD;
  return -Math.PI + tilt;
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return current;
}

/**
 * Ambient-cluster walker / flier (Java GoldenRoach.java).
 * Walks on deco blobs; flies between clusters. No SOLID collision. Contact only while flying.
 */
export class GoldenRoach implements CombatEnemy {
  x: number;
  y: number;
  vx = 0;
  vy = 0;

  private readonly clusters: AmbientClusterMap;
  private readonly rng: JavaRandom;
  private mode: GoldenRoachMode = "walk";
  private clusterId = -1;
  private skitterDirX = 0;
  private skitterDirY = 0;
  private skitterTimerSec = 0;
  private landCooldownSec = 0;
  private flyTargetX = 0;
  private flyTargetY = 0;
  private aggro = false;
  private forcedFly = false;
  private hurtLocked = false;
  private visionSeesPlayer = false;
  private animFrame = 0;
  private animAccum = 0;
  private animFrameSec = 0.125;
  private hp: number;
  readonly maxHp: number;
  hitstun = 0;
  private pendingKnockVx = 0;
  private pendingKnockVy = 0;
  private pendingKnockContactOnly = false;
  private pendingCorpseExplosion = false;
  private cameraViewWorld: WorldRect | null = null;
  private lastMap: TileMap | null = null;
  private stableBearingRad = artRestBearingRadForMode("walk");
  private flyElapsedSec = 0;
  private chaseFlyElapsedSec = 0;
  private chasePerchRequired = false;
  private chaseSwoopPhase: ChaseSwoopPhase = "none";
  private chaseSwoopAxisX = 0;
  private chaseSwoopAxisY = 0;
  private squashImpulseThisFrame = false;

  readonly squash = new SquashStretch();
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  hitlagSolidRed = false;
  hitlagElectrocute = false;
  private hurtTintRemaining = 0;
  readonly blackHeartBeat = new BlackHeartBeatDeferral();

  constructor(x: number, y: number, maxHp: number, clusters: AmbientClusterMap) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.clusters = clusters;
    this.rng = new JavaRandom(BigInt(Math.floor(Math.random() * 0x1_0000_0000)));
    this.clusterId = this.clusters.clusterIdAtWorld(this.centerX(), this.centerY());
    if (this.clusterId < 0) this.clusterId = this.primaryClusterIdUnderHitbox();
    this.pickClusterSkitterDir();
    this.skitterTimerSec = this.randomSkitterDuration();
  }

  getMode(): GoldenRoachMode {
    return this.mode;
  }

  renderAngleRad(): number {
    return this.stableBearingRad - artRestBearingRadForMode(this.mode);
  }

  getAnimFrame(): number {
    return this.animFrame;
  }

  setCameraView(view: WorldRect): void {
    this.cameraViewWorld = view;
  }

  prepareVisionTick(map: TileMap): void {
    this.lastMap = map;
  }

  applyVision(playerCx: number, playerCy: number, seeRadiusPx: number): void {
    const roachSee = seeRadiusPx * SEE_RADIUS_MULT;
    const cx = this.centerX();
    const cy = this.centerY();
    this.visionSeesPlayer =
      this.lastMap != null &&
      seesPlayerWithSolidLos(this.lastMap, cx, cy, playerCx, playerCy, roachSee);
    if (this.visionSeesPlayer) this.aggro = true;
  }

  seesPlayer(): boolean {
    return this.visionSeesPlayer;
  }

  update(dt: number, map: TileMap, playerX: number): void {
    this.lastMap = map;
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

    this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    this.landCooldownSec = Math.max(0, this.landCooldownSec - dt);
    this.squashImpulseThisFrame = false;
    this.tickAnimation(dt);

    if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
      const hadHitstun = this.hitstun > 0;
      tickBlackHeartEnemyHitstun(dt, this);
      if (hadHitstun && this.hitstun <= 0 && !this.blackHeartBeat.isLocked()) {
        this.finishHitstunKnockRelease();
      }
      this.vx = 0;
      this.vy = 0;
      this.finishRenderSquash(dt);
      return;
    }

    const playerCenterY = this.playerFeetCenterYGuess(map, playerX);
    if (this.aggro && this.visionSeesPlayer) {
      this.steerAggro(playerX, playerCenterY, dt);
    }
    if (this.mode === "walk") {
      this.tickWalkSkitterPlan(dt, playerX, playerCenterY);
      this.tickWalk(dt);
    } else {
      this.tickFly(dt, map, playerX, playerCenterY);
    }
    this.updateStableBearing();
    this.clusterId = this.primaryClusterIdUnderHitbox();
    this.finishRenderSquash(dt);
  }

  private finishRenderSquash(dt: number): void {
    if (!this.squashImpulseThisFrame) this.squash.tick(dt);
  }

  private onClusterSurface(): boolean {
    return this.clusters.overlapsWorldRect(this.rect());
  }

  private playerFeetCenterYGuess(map: TileMap, playerX: number): number {
    const tx = Math.floor(playerX / TILE_SIZE);
    const floor = map.groundTopWorldYAtColumn(tx);
    return floor - 9;
  }

  private tickAnimation(dt: number): void {
    this.animAccum += dt;
    if (this.animAccum >= this.animFrameSec) {
      this.animAccum -= this.animFrameSec;
      this.animFrame = (this.animFrame + 1) % 2;
    }
    if (this.mode === "walk") {
      const speed = Math.hypot(this.vx, this.vy);
      this.animFrameSec = 1 / Math.max(4, Math.min(8, 4 + speed / 18));
    } else {
      this.animFrameSec = 1 / FLY_ANIM_FPS;
    }
  }

  private tickWalkSkitterPlan(dt: number, playerX: number, playerCenterY: number): void {
    this.skitterTimerSec -= dt;
    if (this.skitterTimerSec <= 0) {
      if (this.aggro && this.visionSeesPlayer && this.onClusterSurface()) {
        const playerCluster = this.clusters.clusterIdAtWorld(playerX, playerCenterY);
        if (this.clusters.clusterSteps(this.clusterId, playerCluster) >= 0) {
          this.skitterTowardOnCluster(playerX, playerCenterY);
        } else {
          this.pickClusterSkitterDir();
        }
      } else {
        this.pickClusterSkitterDir();
      }
      this.skitterTimerSec = this.randomSkitterDuration();
    }
    if (
      !this.aggro &&
      this.landCooldownSec <= 0 &&
      this.onClusterSurface() &&
      this.rng.nextDouble() < IDLE_FLY_ROLL_PER_SEC * dt
    ) {
      this.beginFlyToRandomCluster(false);
    }
  }

  private steerAggro(playerX: number, playerCenterY: number, dt: number): void {
    if (this.chasePerchRequired || this.landCooldownSec > 0) return;
    if (this.mode === "fly") {
      this.forcedFly = this.chaseSwoopPhase === "pass";
      return;
    }
    if (!this.onClusterSurface()) {
      this.tryBeginChaseFly(playerX, playerCenterY);
      return;
    }
    const playerCluster = this.clusters.clusterIdAtWorld(playerX, playerCenterY);
    if (playerCluster >= 0 && this.clusters.clusterSteps(this.clusterId, playerCluster) < 0) {
      this.tryBeginChaseFly(playerX, playerCenterY);
      return;
    }
    if (playerCluster < 0 && this.rng.nextDouble() < CHASE_FLY_ROLL_PER_SEC * dt) {
      this.tryBeginChaseFly(playerX, playerCenterY);
    }
  }

  private tryBeginChaseFly(playerX: number, playerCenterY: number): void {
    if (this.mode === "fly" || this.chasePerchRequired || this.landCooldownSec > 0) return;
    this.planChaseSwoop(playerX, playerCenterY);
    this.beginFly(true);
  }

  private planChaseSwoop(playerX: number, playerCenterY: number): void {
    const cx = this.centerX();
    const cy = this.centerY();
    let dx = playerX - cx;
    let dy = playerCenterY - cy;
    let dist = Math.hypot(dx, dy);
    if (dist < 8) {
      dx = this.skitterDirX !== 0 ? this.skitterDirX : this.rng.nextBoolean() ? 1 : -1;
      dy = -0.4;
      dist = Math.hypot(dx, dy);
    }
    const ax = dx / dist;
    const ay = dy / dist;
    const perpX = -ay;
    const perpY = ax;
    const side = this.rng.nextBoolean() ? 1 : -1;
    this.chaseSwoopAxisX = ax;
    this.chaseSwoopAxisY = ay;
    this.flyTargetX = playerX + ax * SWOOP_OVERSHOOT_PX + perpX * SWOOP_LATERAL_PX * side;
    this.flyTargetY = playerCenterY + ay * SWOOP_OVERSHOOT_PX + perpY * SWOOP_LATERAL_PX * side;
    this.chaseSwoopPhase = "pass";
  }

  private beginChaseSwoopReturn(): void {
    this.chaseSwoopPhase = "return";
    this.forcedFly = false;
    let pt =
      this.clusterId >= 0 ? this.clusters.randomPointInCluster(this.rng, this.clusterId) : null;
    if (!pt) pt = this.clusters.randomPointInRandomCluster(this.rng, this.clusterId);
    if (!pt && this.clusterId >= 0) {
      pt = this.clusters.nearestCellCenterInCluster(this.centerX(), this.centerY(), this.clusterId);
    }
    if (pt) {
      this.flyTargetX = pt[0];
      this.flyTargetY = pt[1];
    }
  }

  private tickWalk(dt: number): void {
    const wantVx = this.skitterDirX * WALK_SPEED;
    const wantVy = this.skitterDirY * WALK_SPEED;
    this.vx = moveToward(this.vx, wantVx, WALK_ACCEL * dt);
    this.vy = moveToward(this.vy, wantVy, WALK_ACCEL * dt);
    const prevX = this.x;
    const prevY = this.y;
    this.moveFree(dt);
    if (!this.onClusterSurface()) {
      this.x = prevX;
      this.y = prevY;
      this.vx = 0;
      this.vy = 0;
      this.pickClusterSkitterDir();
      this.skitterTimerSec = this.randomSkitterDuration();
    } else {
      this.clusterId = this.primaryClusterIdUnderHitbox();
      if (!this.chasePerchRequired) this.forcedFly = false;
    }
  }

  private tickFly(dt: number, map: TileMap, playerX: number, playerCenterY: number): void {
    this.flyElapsedSec += dt;
    if (this.chaseSwoopPhase !== "none" && this.aggro && !this.chasePerchRequired) {
      this.chaseFlyElapsedSec += dt;
      if (this.chaseFlyElapsedSec >= MAX_CHASE_FLY_SEC) this.beginChasePerch(map);
    }
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * FLY_GRAVITY_MULT * dt);
    this.biasFlyTargetToCamera();
    const fullSpeedLeg = this.chaseSwoopPhase === "pass";
    this.steerTowardFlyTarget(dt, !fullSpeedLeg);
    if (this.chaseSwoopPhase === "pass") this.tickChaseSwoopPass(playerX, playerCenterY);
    this.moveFree(dt);
    this.tryLandOnCluster(map);
  }

  private tickChaseSwoopPass(playerX: number, playerCenterY: number): void {
    const pastPx =
      (this.centerX() - playerX) * this.chaseSwoopAxisX +
      (this.centerY() - playerCenterY) * this.chaseSwoopAxisY;
    const passDx = this.flyTargetX - this.centerX();
    const passDy = this.flyTargetY - this.centerY();
    if (pastPx >= SWOOP_PASS_CLEAR_PX || Math.hypot(passDx, passDy) <= 20) {
      this.beginChaseSwoopReturn();
    }
  }

  private biasFlyTargetToCamera(): void {
    const view = this.cameraViewWorld;
    if (!view || view.w <= 0 || view.h <= 0) return;
    const b = this.rect();
    const margin = FLY_CAMERA_MARGIN_PX;
    let minCx = view.x + margin + b.w * 0.5;
    let maxCx = view.x + view.w - margin - b.w * 0.5;
    let minCy = view.y + margin + b.h * 0.5;
    let maxCy = view.y + view.h - margin - b.h * 0.5;
    if (maxCx < minCx) minCx = maxCx = (minCx + maxCx) * 0.5;
    if (maxCy < minCy) minCy = maxCy = (minCy + maxCy) * 0.5;
    const cx = this.centerX();
    const cy = this.centerY();
    let nudgeX = 0;
    let nudgeY = 0;
    if (cx < minCx) nudgeX = minCx - cx;
    else if (cx > maxCx) nudgeX = maxCx - cx;
    if (cy < minCy) nudgeY = minCy - cy;
    else if (cy > maxCy) nudgeY = maxCy - cy;
    if (nudgeX !== 0 || nudgeY !== 0) {
      this.flyTargetX += nudgeX;
      this.flyTargetY += nudgeY;
    }
  }

  private steerTowardFlyTarget(dt: number, allowArriveSlowdown: boolean): void {
    const dx = this.flyTargetX - this.centerX();
    const dy = this.flyTargetY - this.centerY();
    const dist = Math.hypot(dx, dy);
    if (dist <= 1) {
      if (!allowArriveSlowdown) return;
      this.vx = moveToward(this.vx, 0, FLY_DECEL * dt);
      this.vy = moveToward(this.vy, 0, FLY_DECEL * dt);
      return;
    }
    const speedCap = allowArriveSlowdown
      ? FLY_MAX_SPEED * Math.min(1, dist / FLY_ARRIVE_RADIUS)
      : FLY_MAX_SPEED;
    const wantVx = (dx / dist) * speedCap;
    const wantVy = (dy / dist) * speedCap;
    this.vx = moveToward(this.vx, wantVx, FLY_ACCEL * dt);
    this.vy = moveToward(this.vy, wantVy, FLY_ACCEL * dt);
  }

  private moveFree(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  private tryLandOnCluster(map: TileMap): void {
    if (this.flyElapsedSec < MIN_FLY_SEC) return;
    if (!this.forcedFly && this.vy <= 0 && Math.hypot(this.vx, this.vy) > 8) return;
    if (this.clusters.overlapsWorldRect(this.rect())) this.landOnCurrentCluster(map);
  }

  private landOnCurrentCluster(_map: TileMap): void {
    if (this.mode !== "fly") return;
    this.mode = "walk";
    this.vx = 0;
    this.vy = 0;
    this.forcedFly = false;
    this.flyElapsedSec = 0;
    this.chaseFlyElapsedSec = 0;
    this.chasePerchRequired = false;
    this.chaseSwoopPhase = "none";
    this.landCooldownSec = LAND_COOLDOWN_SEC;
    this.squashImpulseThisFrame = true;
    this.squash.applyStretchX(LAND_STRETCH_X, TRANSITION_SQUASH_FRAMES);
    this.clusterId = this.primaryClusterIdUnderHitbox();
    this.snapToNearestClusterCell();
    this.pickClusterSkitterDir();
    this.skitterTimerSec = this.randomSkitterDuration();
  }

  private beginChasePerch(map: TileMap): void {
    this.forcedFly = false;
    this.chasePerchRequired = true;
    this.chaseFlyElapsedSec = 0;
    this.chaseSwoopPhase = "none";
    if (this.onClusterSurface() && this.flyElapsedSec >= MIN_FLY_SEC) {
      this.landOnCurrentCluster(map);
      return;
    }
    let pt = this.clusters.randomPointInRandomCluster(this.rng, this.clusterId);
    if (!pt && this.clusterId >= 0) pt = this.clusters.randomPointInCluster(this.rng, this.clusterId);
    if (pt) {
      this.flyTargetX = pt[0];
      this.flyTargetY = pt[1];
    }
  }

  private beginFlyToRandomCluster(chase: boolean): void {
    if (this.landCooldownSec > 0) return;
    const pt = this.clusters.randomPointInRandomCluster(this.rng, this.clusterId);
    if (!pt) return;
    this.flyTargetX = pt[0];
    this.flyTargetY = pt[1];
    this.beginFly(chase, false);
  }

  private beginFly(chase: boolean, ignoreLandCooldown = false): void {
    if (this.mode !== "fly" && this.landCooldownSec > 0 && !ignoreLandCooldown) return;
    const takingOff = this.mode !== "fly";
    this.mode = "fly";
    this.forcedFly = chase;
    if (takingOff) {
      this.flyElapsedSec = 0;
      this.squashImpulseThisFrame = true;
      this.squash.applyStretchY(TAKEOFF_STRETCH_Y, TRANSITION_SQUASH_FRAMES);
      this.animFrame = 0;
      this.animAccum = 0;
    }
    if (chase) this.chaseFlyElapsedSec = 0;
    else this.chaseSwoopPhase = "none";
  }

  private snapToNearestClusterCell(): void {
    const id = this.clusterId >= 0 ? this.clusterId : this.primaryClusterIdUnderHitbox();
    if (id < 0) return;
    const center = this.clusters.nearestCellCenterInCluster(this.centerX(), this.centerY(), id);
    if (!center) return;
    const b = this.rect();
    this.x = center[0] - b.w * 0.5;
    this.y = center[1] - b.h * 0.5;
    this.clusterId = id;
  }

  private clusterGridCellForSkitter(id: number): [number, number] | null {
    const tx = Math.floor(this.centerX() / TILE_SIZE);
    const ty = Math.floor(this.centerY() / TILE_SIZE);
    if (this.clusters.isCellInCluster(tx, ty, id)) return [tx, ty];
    const center = this.clusters.nearestCellCenterInCluster(this.centerX(), this.centerY(), id);
    if (!center) return null;
    return [Math.floor(center[0] / TILE_SIZE), Math.floor(center[1] / TILE_SIZE)];
  }

  private pickClusterSkitterDir(): void {
    const id = this.clusterId >= 0 ? this.clusterId : this.primaryClusterIdUnderHitbox();
    if (id < 0) {
      this.pickRandomSkitterDir();
      return;
    }
    this.clusterId = id;
    const cell = this.clusterGridCellForSkitter(id);
    if (!cell) {
      this.pickRandomSkitterDir();
      return;
    }
    const dir = this.clusters.randomWalkDirInCluster(this.rng, cell[0], cell[1], id);
    if (dir) {
      this.setSkitter(dir[0], dir[1]);
      return;
    }
    this.pickRandomSkitterDir();
  }

  private skitterTowardOnCluster(tx: number, ty: number): void {
    if (this.clusterId < 0) {
      this.setSkitterFromVector(tx - this.centerX(), ty - this.centerY());
      return;
    }
    const cell = this.clusterGridCellForSkitter(this.clusterId);
    if (!cell) return;
    const dir = this.clusters.walkDirTowardCell(cell[0], cell[1], this.clusterId, tx, ty);
    if (dir) this.setSkitter(dir[0], dir[1]);
  }

  private primaryClusterIdUnderHitbox(): number {
    const atCenter = this.clusters.clusterIdAtWorld(this.centerX(), this.centerY());
    if (atCenter >= 0) return atCenter;
    const b = this.rect();
    const minTx = Math.floor(b.x / TILE_SIZE);
    const maxTx = Math.floor((b.x + b.w - 1e-9) / TILE_SIZE);
    const minTy = Math.floor(b.y / TILE_SIZE);
    const maxTy = Math.floor((b.y + b.h - 1e-9) / TILE_SIZE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const id = this.clusters.clusterIdAt(tx, ty);
        if (id >= 0) return id;
      }
    }
    return -1;
  }

  private updateStableBearing(): void {
    if (this.mode === "walk" && (this.skitterDirX !== 0 || this.skitterDirY !== 0)) {
      this.stableBearingRad = Math.atan2(this.skitterDirY, this.skitterDirX);
      return;
    }
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 1) this.stableBearingRad = Math.atan2(this.vy, this.vx);
  }

  private pickRandomSkitterDir(): void {
    const dirs: Array<[number, number]> = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    const d = dirs[this.rng.nextInt(dirs.length)]!;
    this.setSkitter(d[0], d[1]);
  }

  private setSkitterFromVector(dx: number, dy: number): void {
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    if (sx === 0 && sy === 0) {
      this.pickRandomSkitterDir();
      return;
    }
    this.setSkitter(sx, sy);
  }

  private setSkitter(dx: number, dy: number): void {
    this.skitterDirX = dx;
    this.skitterDirY = dy;
  }

  private randomSkitterDuration(): number {
    return SKITTER_MIN_SEC + this.rng.nextDouble() * (SKITTER_MAX_SEC - SKITTER_MIN_SEC);
  }

  private centerX(): number {
    return this.x + this.rect().w * 0.5;
  }

  private centerY(): number {
    return this.y + this.rect().h * 0.5;
  }

  private finishHitstunKnockRelease(): void {
    if (this.pendingKnockContactOnly) {
      this.pendingKnockContactOnly = false;
      this.hurtLocked = false;
      return;
    }
    this.vx = this.pendingKnockVx;
    this.vy = this.pendingKnockVy;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    this.pendingKnockVx = 0;
    this.pendingKnockVy = 0;
    if (Math.abs(this.vx) + Math.abs(this.vy) > 1 || this.aggro) {
      this.flyTargetX = this.centerX();
      this.flyTargetY = this.centerY();
      this.beginFly(false, true);
    }
    this.hurtLocked = false;
  }

  private roachPose(
    local: ReadonlyArray<number>,
    pivotLocalX: number,
    ax = this.x,
    ay = this.y,
  ): HitboxPose {
    return new HitboxPose(local, ax, ay, 1, pivotLocalX);
  }

  private poseAt(ax: number, ay: number): HitboxPose {
    if (this.mode === "fly") {
      return this.roachPose(ENEMY_GOLDEN_ROACH_FLY_LOCAL, ENEMY_GOLDEN_ROACH_FLY_PIVOT_X, ax, ay);
    }
    return this.roachPose(ENEMY_GOLDEN_ROACH_WALK_LOCAL, ENEMY_GOLDEN_ROACH_WALK_PIVOT_X, ax, ay);
  }

  rect(): Aabb {
    return this.poseAt(this.x, this.y).bounds();
  }

  contactDamagePose(): Aabb {
    if (this.mode !== "fly") return EMPTY_AABB;
    return this.roachPose(ENEMY_GOLDEN_ROACH_FLY_HIT_LOCAL, ENEMY_GOLDEN_ROACH_FLY_HIT_PIVOT_X).bounds();
  }

  damageReceivePose(): Aabb {
    if (this.mode === "fly") {
      return this.roachPose(
        ENEMY_GOLDEN_ROACH_FLY_HURT_LOCAL,
        ENEMY_GOLDEN_ROACH_FLY_HURT_PIVOT_X,
      ).bounds();
    }
    return this.roachPose(
      ENEMY_GOLDEN_ROACH_WALK_HURT_LOCAL,
      ENEMY_GOLDEN_ROACH_WALK_HURT_PIVOT_X,
    ).bounds();
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.isDead()) return false;
    if (this.mode === "fly") {
      return this.roachPose(
        ENEMY_GOLDEN_ROACH_FLY_HURT_LOCAL,
        ENEMY_GOLDEN_ROACH_FLY_HURT_PIVOT_X,
      ).intersectsRect(sword);
    }
    return this.roachPose(
      ENEMY_GOLDEN_ROACH_WALK_HURT_LOCAL,
      ENEMY_GOLDEN_ROACH_WALK_HURT_PIVOT_X,
    ).intersectsRect(sword);
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
    const kb = knockbackFor(strike.knockKind, away);
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
    this.pendingKnockContactOnly = false;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    return true;
  }

  releaseBlackHeartBeatKnockback(): void {
    releaseBlackHeartBeatKnockback(this.blackHeartBeat, (vx, vy) => {
      this.pendingKnockVx = vx;
      this.pendingKnockVy = vy;
      this.pendingKnockContactOnly = false;
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
    const scaled = strike.damage * PROJECTILE_DAMAGE_MULT;
    this.hp = Math.max(0, this.hp - scaled);
    this.hitstun = Math.max(0.12, strike.freezeFrames / 60);
    applySolidRedHitstunJuice(this);
    const kb = knockbackForFrisbee(strike.projectileVelX);
    this.pendingKnockVx = kb.vx;
    this.pendingKnockVy = kb.vy;
    this.pendingKnockContactOnly = false;
    this.hurtTintRemaining = HURT_TINT_SECONDS;
    return true;
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (
      this.isDead() ||
      this.mode !== "fly" ||
      this.hitstun > 0 ||
      this.blackHeartBeat.isLocked() ||
      this.hurtLocked
    ) {
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
    if (Math.abs(this.vx) > 4) return this.vx >= 0 ? 1 : -1;
    if (this.skitterDirX !== 0) return this.skitterDirX;
    return Math.cos(this.stableBearingRad) >= 0 ? 1 : -1;
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SECONDS));
  }

  isOnGround(): boolean {
    return this.mode === "walk" && this.onClusterSurface();
  }
}
