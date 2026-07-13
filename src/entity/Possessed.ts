import { HitboxPose } from "../collision/HitboxPose";
import {
  aabbOverlap,
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
import { isPossessedShiny, VARIANT_NORMAL } from "../combat/EnemyVariantRegistry";
import {
  rectBottom,
  rectLeft,
  rectRight,
  rectTop,
  seesPlayerAt,
  type PlayerCombatSnapshot,
  type WorldRect,
} from "../combat/EnemyVision";
import { HURT_TINT_PEAK_ALPHA, HURT_TINT_SECONDS } from "../combat/HitlagState";
import {
  getPossessedRig,
  poseFromSequence,
  poseOffset,
  type PossessedPartDef,
  type PossessedRigData,
} from "../boss/PossessedRig";
import { polygonBounds, polygonIntersectsAabb } from "../collision/polygonIntersect";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";

export type PossessedDeathChunkSpawn = {
  frameIndex: number;
  pivotWorldX: number;
  pivotWorldY: number;
  vx: number;
  vy: number;
  angleRad: number;
  omega: number;
  pivotX: number;
  pivotY: number;
  mirror: boolean;
  hullLocal: number[] | null;
};

const POSSESSED_DEBRIS_LIFETIME_SEC = 8;
const POSSESSED_DEBRIS_BLINK_START_SEC = 7;
export { POSSESSED_DEBRIS_LIFETIME_SEC, POSSESSED_DEBRIS_BLINK_START_SEC };
const FLOAT_SPEED = 55;
const STANDOFF = 60;
const STANDOFF_PAD = 26;
const ROOM_MARGIN = 18;
const VIEW_MARGIN = 28;
const DEATH_REWARD_DELAY_SEC = 4.0;
/** Parting explosion pops during early death throes (Java DEATH_EXPLOSION_INTERVAL). */
const DEATH_EXPLOSION_INTERVAL = 0.11;
/** Window after defeat during which the body emits parting explosion pops (Java DEATH_THROES_SEC). */
const DEATH_THROES_SEC = 0.55;
const BASE_AGGRESSION = 0.25;
const ENRAGE_HP_FRAC = 0.5;
const ORBIT_SPEED_FRAC = 0.85;
const ORBIT_FLIP_MIN = 1.4;
const ORBIT_FLIP_MAX = 3.2;
const WINDUP_SEC = 0.6;
const NOVA_WINDUP_MULT = 2;
/** Unique opaque colors from possessed.png, dark → bright (Java NOVA_SPRITE_PALETTE). */
const NOVA_SPRITE_PALETTE = [0x5b315b, 0x76428a, 0xcbdbfc, 0xffffff] as const;
/** Must match drawPossessedNovaRing period. */
const NOVA_STREAK_PERIOD_SEC = 0.42;
const NOVA_STREAK_SPOKES = 8;
const NOVA_STREAK_RINGS = 2;
const NOVA_ABSORB_HIT_FRAC = 0.88;
const NOVA_ABSORB_FLASH_SEC = 0.11;
/** Forward-thrust "release" pose duration right after firing. */
const RELEASE_POSE_SEC = 0.12;
const SHOOT_CD_MIN = 1.2;
const SHOOT_CD_MAX = 2.0;
const BULLET_SPEED = 110;
const BULLET_DAMAGE = 1;
const LEAD_MAX_SEC = 0.55;
const VOLLEY_INTERVAL = 0.11;
const PATTERN_HP_FRAC = 0.5;
const REACT_HP_FRAC = 1 / 3;
const SHINY_MOVE_SPEED_MULT = 1.2;
const SHINY_KITE_HP_FRAC = 0.5;
const KITE_RADIUS = 86;
const THREAT_RADIUS = 62;
const DODGE_IMPULSE = 240;
const DODGE_COOLDOWN = 1.3;
const COUNTER_WINDUP = 0.3;
const DASH_WINDUP = 0.9;
const DASH_SPEED = 260;
const DASH_SEC = 0.42;
const DASH_CONTACT = DASH_SEC + 0.05;
const DASH_MIN_RANGE = 36;
const DASH_MAX_RANGE = 150;
const DASH_CHANCE = 0.3;
const JUKE_CONTACT = 0.4;
const KNOCKBACK_CONTACT_DISABLE = 0.5;
const HURT_POSE_SEC = 0.2;
/** Matches Java Possessed.HURT_TINT_SEC (also HitlagState.HURT_TINT_SECONDS). */
const HURT_TINT_SEC = HURT_TINT_SECONDS;
const BULLET_HALF = 3;
const POSSESSED_BULLET_BOX_LOCAL = [
  0,
  0,
  BULLET_HALF * 2,
  0,
  BULLET_HALF * 2,
  BULLET_HALF * 2,
  0,
  BULLET_HALF * 2,
] as const;

/** Damage hitbox for possessed boss bullets (Java Possessed.Bullet.damagePose). */
export function possessedBulletDamagePose(b: PossessedBullet): HitboxPose {
  const fs = b.vx >= 0 ? 1 : -1;
  const anchorX = b.x - BULLET_HALF;
  const anchorY = b.y - BULLET_HALF;
  return new HitboxPose(
    POSSESSED_BULLET_BOX_LOCAL,
    anchorX,
    anchorY,
    fs,
    BULLET_HALF,
  );
}
const PEEK_CHANCE = 0.5;
const SETTLED_K = 220;
const SETTLED_C = 2 * Math.sqrt(SETTLED_K);
const LOOSE_K = 40;
const LOOSE_C = 2 * Math.sqrt(LOOSE_K);
const ANGLE_K = 200;
const ANGLE_C = 2 * Math.sqrt(ANGLE_K);
const WALL_REST = 0.7;
const FLOOR_REST = 0.6;
const KNOCK_SPEED = 170;
const KNOCK_UP = 70;
const KNOCK_SPIN_DEG = 520;
const LOOSE_MIN_SEC = 0.22;
/** Fraction of struck limb impulse passed to the assembly anchor (1.0 = full). */
const ANCHOR_TRAIL_FRAC = 1.0;
/** EarthBound-style per-row scanline warp (matches Java Possessed / GamePanel). */
export const SCANLINE_PHASE_PER_ROW_RAD = 0.52;
const SCANLINE_TIME_SPEED_RAD_PER_SEC = 2.8;
const BULLET_DIE_FRAME_SEC = 0.18;
const BULLET_DIE_MAX_AGE = BULLET_DIE_FRAME_SEC * 2;

type Phase = "A" | "B" | "C";
export type PossessedAttackType = "AIMED" | "VOLLEY" | "FAN" | "NOVA" | "DASH";
export type PossessedVariant = "NORMAL" | "SHINY";

export type PossessedBullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  dead: boolean;
  hitPlayer: boolean;
  stickReflected?: boolean;
  stickReflectBaseDamage?: number;
  hitlagRemoveRemaining?: number;
  playerOverlapHandled?: boolean;
};

export type PossessedBulletDieFx = {
  x: number;
  y: number;
  age: number;
};

/** World-space PartSim (Java Possessed.PartSim). */
export type PossessedPartSim = {
  name: string;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  angleDeg: number;
  angleVel: number;
  loose: boolean;
  looseTimer: number;
  bobPhase: number;
};

/** Per-part draw info for scanline warp + pivot rotation (Java PartRender). */
export type PossessedPartRender = {
  name: string;
  frame: number;
  cx: number;
  cy: number;
  angleRad: number;
  mirror: boolean;
  pivotX: number;
  pivotY: number;
  scanlinePhaseBase: number;
  scanlineAmpPx: number;
};

/** Charge-orb render info during wind-up (Java Possessed.ChargeFx). */
export type PossessedChargeFx = {
  cx: number;
  cy: number;
  scale: number;
  animFrame: number;
};

/** Inward-sucking nova ring tell (Java Possessed.NovaChargeFx). */
export type PossessedNovaChargeFx = {
  cx: number;
  cy: number;
  progress: number;
  t: number;
  chargeRgb: number;
};

/**
 * Phase 5b Possessed — Java combat parity (aimed/volley/fan/nova/dash, kite, dodge+counter).
 * Full PartSim (world springs + wall bounce) + scanline warp via partRenders().
 */
export class Possessed implements CombatEnemy {
  x: number;
  y: number;
  w = 16;
  h = 16;
  vx = 0;
  vy = 0;
  hp: number;
  readonly maxHp: number;
  readonly variant: PossessedVariant;
  private phase: Phase = "C";
  private phaseTimer = 1.0;
  private wanderTx = 0;
  private wanderTy = 0;
  private peeking = false;
  /** Defensive freeze remaining (seconds); Java hitstunFrames. */
  hitstun = 0;
  private deathTimer = -1;
  private hurtPoseTimer = 0;
  private hurtTintRemaining = 0;
  private knockbackContactTimer = 0;
  private contactActiveTimer = 0;
  /** Solid-red hitstun flash (not electrocute). */
  hitlagSolidRed = false;
  hitlagElectrocute = false;
  hitlagShakeX = 0;
  hitlagShakeY = 0;
  readonly blackHeartBeat = new BlackHeartBeatDeferral();
  private dodgeCooldown = 0;
  private mapW = 256;
  private mapH = 256;
  private cameraView: WorldRect | null = null;
  private visionSeesPlayer = false;
  private playerCx = NaN;
  private playerCy = NaN;
  private playerVx = 0;
  private playerVy = 0;
  private facingRight = true;
  private orbitDir = 1;
  private orbitFlipTimer = 2;
  private shootCooldown = 0.8;
  private firing = false;
  private windupTimer = 0;
  private windupDuration = WINDUP_SEC;
  private releaseTimer = 0;
  private pendingAttack: PossessedAttackType = "AIMED";
  private volleyRemaining = 0;
  private volleyTimer = 0;
  private counterShot = false;
  private dashing = false;
  private dashTimer = 0;
  private dashDirX = -1;
  private dashDirY = 0;
  private aimDx = 1;
  private aimDy = 0;
  private bobTime = 0;
  private readonly bullets: PossessedBullet[] = [];
  private readonly bulletDieFx: PossessedBulletDieFx[] = [];
  private readonly partSims: PossessedPartSim[] = [];
  private deathDebrisSpawned = false;
  private deathExplosionAccum = 0;
  private readonly explosionRequests: Array<[number, number]> = [];
  private readonly pendingDeathChunkSpawns: PossessedDeathChunkSpawn[] = [];
  /** Part indices struck by the latest melee probe (Java lastStruckParts). */
  private readonly lastStruckParts: number[] = [];
  /** Per-channel latch so each inward streak triggers one absorb flash (spokes + rings). */
  private readonly novaStreakAbsorbFired = new Array<boolean>(
    NOVA_STREAK_SPOKES + NOVA_STREAK_RINGS,
  ).fill(false);
  private novaAbsorbFlashTimer = 0;
  private novaAbsorbFlashColor: number = NOVA_SPRITE_PALETTE[0];

  constructor(
    centerX: number,
    centerY: number,
    maxHp: number,
    variantId: string | null | undefined = VARIANT_NORMAL,
  ) {
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.variant = isPossessedShiny(variantId) ? "SHINY" : "NORMAL";
    this.x = centerX - this.w * 0.5;
    this.y = centerY - this.h * 0.5;
    this.wanderTx = centerX;
    this.wanderTy = centerY;
    this.initPartSims();
    if (this.isShiny()) {
      this.phase = "A";
      this.phaseTimer = 1.6 + Math.random() * 1.2;
    }
  }

  isShiny(): boolean {
    return this.variant === "SHINY";
  }

  bulletDieFxCopy(): readonly PossessedBulletDieFx[] {
    return this.bulletDieFx;
  }

  partSimsCopy(): readonly PossessedPartSim[] {
    return this.partSims;
  }

  /**
   * Per-part render info for drawPossessed. Empty while dying (debris owns limbs).
   * Matches Java partRenders (no interp alpha — web draws at sim state).
   */
  partRenders(): PossessedPartRender[] {
    if (this.deathTimer >= 0) return [];
    const rig = getPossessedRig();
    if (!rig || this.partSims.length === 0) return [];
    this.ensureSims(rig);
    const out: PossessedPartRender[] = [];
    const mirror = this.facingRight;
    for (const name of rig.drawOrder) {
      const def = rig.parts.find((p) => p.name === name);
      const p = this.partSims.find((s) => s.name === name);
      if (!def || !p) continue;
      let ang = (p.angleDeg * Math.PI) / 180;
      ang = snapAngleToPixels(ang, rig.frameW, rig.frameH, def.pivotX, def.pivotY);
      const scanPhase = this.bobTime * SCANLINE_TIME_SPEED_RAD_PER_SEC + p.bobPhase;
      const scanAmp = rig.scanlineAmpPx * def.scanlineScale;
      out.push({
        name: def.name,
        frame: def.frame,
        cx: p.cx,
        cy: p.cy,
        angleRad: ang,
        mirror,
        pivotX: def.pivotX,
        pivotY: def.pivotY,
        scanlinePhaseBase: scanPhase,
        scanlineAmpPx: scanAmp,
      });
    }
    return out;
  }

  /** Drain death chunk spawns once (mount builds pivot-anchored BrickChunks). */
  drainDeathChunkSpawns(): PossessedDeathChunkSpawn[] {
    if (this.pendingDeathChunkSpawns.length === 0) return [];
    const out = [...this.pendingDeathChunkSpawns];
    this.pendingDeathChunkSpawns.length = 0;
    return out;
  }

  /** World-space points for kill-explosion pops this tick (Java drainExplosionRequests). */
  drainExplosionRequests(): Array<[number, number]> {
    if (this.explosionRequests.length === 0) return [];
    const out = [...this.explosionRequests];
    this.explosionRequests.length = 0;
    return out;
  }

  /** Skip generic cull explosion — we emit death-throe pops + limb debris (Java suppressDeathExplosion). */
  suppressDeathExplosion(): boolean {
    return true;
  }

  private ensureSims(rig: PossessedRigData): void {
    const same =
      this.partSims.length === rig.parts.length &&
      this.partSims.every((s, i) => s.name === rig.parts[i]!.name);
    if (same) return;
    this.initPartSims(rig);
  }

  private initPartSims(rig?: PossessedRigData | null): void {
    const r = rig ?? getPossessedRig();
    const parts = r?.parts ?? [
      { name: "head", pivotX: 8, pivotY: 8 },
      { name: "body", pivotX: 8, pivotY: 8 },
      { name: "handL", pivotX: 8, pivotY: 8 },
      { name: "handR", pivotX: 8, pivotY: 8 },
    ];
    const ax = this.x + this.w * 0.5;
    const ay = this.y + this.h * 0.5;
    const m = this.facingRight ? -1 : 1;
    this.partSims.length = 0;
    for (let i = 0; i < parts.length; i++) {
      const def = parts[i]!;
      const pe = r ? poseOffset(r, "idle", def.name) : { dx: 0, dy: 0, angleDeg: 0 };
      const cx = ax + m * pe.dx;
      const cy = ay + pe.dy;
      this.partSims.push({
        name: def.name,
        cx,
        cy,
        vx: 0,
        vy: 0,
        angleDeg: pe.angleDeg,
        angleVel: 0,
        loose: false,
        looseTimer: 0,
        bobPhase: i * 1.7,
      });
    }
  }

  bindRoom(map: TileMap): void {
    this.mapW = map.getWidth() * TILE_SIZE;
    this.mapH = map.getHeight() * TILE_SIZE;
  }

  setCameraView(view: WorldRect): void {
    this.cameraView = view;
  }

  applyVision(player: PlayerCombatSnapshot, seeRadius: number): void {
    this.playerCx = player.cx;
    this.playerCy = player.cy;
    this.playerVx = player.vx;
    this.playerVy = player.vy;
    const body = this.partSims.find((p) => p.name === "body");
    const cx = body?.cx ?? this.x + this.w * 0.5;
    const cy = body?.cy ?? this.y + this.h * 0.5;
    this.visionSeesPlayer = seesPlayerAt(cx, cy, player.cx, player.cy, seeRadius);
  }

  seesPlayer(): boolean {
    return this.visionSeesPlayer;
  }

  bulletsCopy(): readonly PossessedBullet[] {
    return this.bullets;
  }

  isWindingUp(): boolean {
    return this.firing;
  }

  isDashing(): boolean {
    return this.dashing;
  }

  pendingAttackType(): PossessedAttackType {
    return this.pendingAttack;
  }

  getAimDx(): number {
    return this.aimDx;
  }

  getAimDy(): number {
    return this.aimDy;
  }

  /** Wind-up progress 0..1 (0 at start, 1 when about to fire). */
  windupProgress(): number {
    if (!this.firing || this.windupDuration <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - this.windupTimer / this.windupDuration));
  }

  isNovaWindup(): boolean {
    return this.firing && this.pendingAttack === "NOVA";
  }

  /**
   * Charge-orb during directional wind-up (null for nova/dash).
   * Orb grows from the body toward the aim (Java chargeFx).
   */
  chargeFx(): PossessedChargeFx | null {
    if (
      !this.firing ||
      this.pendingAttack === "NOVA" ||
      this.pendingAttack === "DASH" ||
      this.partSims.length === 0
    ) {
      return null;
    }
    const p =
      this.windupDuration <= 0
        ? 1
        : Math.max(0, Math.min(1, 1 - this.windupTimer / this.windupDuration));
    const body = this.bodySim();
    const dist = 4 + 3 * p;
    const scale = 0.25 + 0.85 * p + 0.12 * Math.sin(this.bobTime * 18);
    const frame = Math.floor(this.bobTime / 0.08) % 2;
    return {
      cx: body.cx + this.aimDx * dist,
      cy: body.cy + this.aimDy * dist,
      scale: Math.max(0.05, scale),
      animFrame: frame,
    };
  }

  /**
   * Inward-sucking ring tell while charging the 8-way nova (null otherwise).
   * progress 0..1; chargeRgb steps through NOVA_SPRITE_PALETTE (Java novaChargeFx).
   */
  novaChargeFx(): PossessedNovaChargeFx | null {
    if (!this.firing || this.pendingAttack !== "NOVA" || this.partSims.length === 0) {
      return null;
    }
    const p =
      this.windupDuration <= 0
        ? 1
        : Math.max(0, Math.min(1, 1 - this.windupTimer / this.windupDuration));
    const body = this.bodySim();
    return {
      cx: body.cx,
      cy: body.cy,
      progress: p,
      t: this.bobTime,
      chargeRgb: novaChargePaletteRgb(p),
    };
  }

  /** Brief full-body tint alpha 0–255 when an energy streak merges into the core. */
  novaAbsorbFlashAlpha(): number {
    if (this.novaAbsorbFlashTimer <= 0) return 0;
    const t = this.novaAbsorbFlashTimer / NOVA_ABSORB_FLASH_SEC;
    return Math.round(255 * t);
  }

  novaAbsorbFlashRgb(): number {
    return this.novaAbsorbFlashColor;
  }

  private bodySim(): PossessedPartSim {
    const body = this.partSims.find((p) => p.name === "body");
    if (body) return body;
    return (
      this.partSims[0] ?? {
        name: "body",
        cx: this.x + this.w * 0.5,
        cy: this.y + this.h * 0.5,
        vx: 0,
        vy: 0,
        angleDeg: 0,
        angleVel: 0,
        loose: false,
        looseTimer: 0,
        bobPhase: 0,
      }
    );
  }

  /** Pose name for multi-part draw (idle / windup / nova / dash_windup / dash / hurt / telegraph). */
  currentPoseName(): string {
    if (this.hurtPoseTimer > 0) return "hurt";
    if (this.firing && this.pendingAttack === "DASH") return "dash_windup";
    if (this.dashing) return "dash";
    if (this.volleyRemaining > 0 || this.releaseTimer > 0) return "telegraph";
    if (this.firing) return this.pendingAttack === "NOVA" ? "nova" : "windup";
    return "idle";
  }

  /** Dash / dash_windup sequence progress 0..1 for poseFromSequence. */
  poseAnimProgress(): number {
    if (this.firing && this.pendingAttack === "DASH") {
      return this.windupDuration <= 0 ? 1 : 1 - this.windupTimer / this.windupDuration;
    }
    if (this.dashing) {
      return DASH_SEC <= 0 ? 1 : 1 - this.dashTimer / DASH_SEC;
    }
    return 0;
  }

  bobTimeSec(): number {
    return this.bobTime;
  }

  update(dt: number, map: TileMap, _playerX: number, _roomEnemies?: readonly CombatEnemy[]): void {
    const rig = getPossessedRig();
    if (rig) this.ensureSims(rig);

    this.bobTime += dt;
    this.hurtPoseTimer = Math.max(0, this.hurtPoseTimer - dt);
    this.hurtTintRemaining = Math.max(0, this.hurtTintRemaining - dt);
    this.knockbackContactTimer = Math.max(0, this.knockbackContactTimer - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.contactActiveTimer = Math.max(0, this.contactActiveTimer - dt);
    this.tickBulletDieFx(dt);

    if (this.deathTimer >= 0) {
      this.deathTimer += dt;
      this.maybeQueueDeathDebris();
      this.tickDeath(dt);
      this.tickBullets(dt, map);
      return;
    }
    if (this.hp <= 0) {
      this.beginDeath();
      this.tickBullets(dt, map);
      return;
    }

    // Java: full freeze while hitstunFrames > 0 or black-heart beat lock.
    if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
      tickBlackHeartEnemyHitstun(dt, this);
      if (this.hitstun > 0 || this.blackHeartBeat.isLocked()) {
        return;
      }
      this.hitlagSolidRed = false;
      this.hitlagShakeX = 0;
      this.hitlagShakeY = 0;
    } else {
      this.hitlagSolidRed = false;
      this.hitlagShakeX = 0;
      this.hitlagShakeY = 0;
    }

    this.tickMovement(dt);
    this.tickShooting(dt);
    this.tickNovaAbsorbFlashes(dt);
    this.integrateParts(dt, map);
    this.tickBullets(dt, map);
  }

  /** Latch brief body tint when inward nova streaks reach the core (Java tickNovaAbsorbFlashes). */
  private tickNovaAbsorbFlashes(dt: number): void {
    this.novaAbsorbFlashTimer = Math.max(0, this.novaAbsorbFlashTimer - dt);
    if (!this.firing || this.pendingAttack !== "NOVA") {
      this.novaStreakAbsorbFired.fill(false);
      return;
    }
    const progress =
      this.windupDuration <= 0
        ? 1
        : Math.max(0, Math.min(1, 1 - this.windupTimer / this.windupDuration));
    const chargeRgb = novaChargePaletteRgb(progress);
    for (let i = 0; i < this.novaStreakAbsorbFired.length; i++) {
      const divisor = i < NOVA_STREAK_SPOKES ? NOVA_STREAK_SPOKES : NOVA_STREAK_RINGS;
      const slot = i < NOVA_STREAK_SPOKES ? i : i - NOVA_STREAK_SPOKES;
      const frac = ((this.bobTime / NOVA_STREAK_PERIOD_SEC) + slot / divisor) % 1;
      if (frac < 0.1) {
        this.novaStreakAbsorbFired[i] = false;
      }
      if (!this.novaStreakAbsorbFired[i] && frac >= NOVA_ABSORB_HIT_FRAC) {
        this.novaStreakAbsorbFired[i] = true;
        this.novaAbsorbFlashTimer = NOVA_ABSORB_FLASH_SEC;
        this.novaAbsorbFlashColor = chargeRgb;
      }
    }
  }

  private beginDeath(): void {
    this.deathTimer = 0;
    this.deathExplosionAccum = 0;
    this.firing = false;
    this.dashing = false;
    this.contactActiveTimer = 0;
    this.bullets.length = 0;
    this.maybeQueueDeathDebris();
  }

  /** Parting explosion pops during early throes (Java tickDeath). */
  private tickDeath(dt: number): void {
    this.deathExplosionAccum += dt;
    if (this.deathExplosionAccum >= DEATH_EXPLOSION_INTERVAL && this.deathTimer < DEATH_THROES_SEC) {
      this.deathExplosionAccum = 0;
      const ex = this.x + (Math.random() - 0.5) * 28;
      const ey = this.y + (Math.random() - 0.5) * 28;
      this.explosionRequests.push([ex, ey]);
    }
  }

  private maybeQueueDeathDebris(): void {
    if (this.deathDebrisSpawned) return;
    this.deathDebrisSpawned = true;
    const rig = getPossessedRig();
    if (!rig || this.partSims.length === 0) {
      const cx = this.x + this.w * 0.5;
      const cy = this.y + this.h * 0.5;
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2;
        const pop = 90 + Math.random() * 70;
        this.pendingDeathChunkSpawns.push({
          frameIndex: i,
          pivotWorldX: cx,
          pivotWorldY: cy,
          vx: Math.cos(ang) * pop,
          vy: Math.sin(ang) * pop - 60,
          angleRad: 0,
          omega: (Math.random() - 0.5) * 12,
          pivotX: 8,
          pivotY: 8,
          mirror: this.facingRight,
          hullLocal: null,
        });
      }
      return;
    }
    for (let i = 0; i < this.partSims.length; i++) {
      const def = rig.parts[i];
      const sim = this.partSims[i]!;
      if (!def) continue;
      const ang = Math.random() * Math.PI * 2;
      const pop = 90 + Math.random() * 70;
      const hull =
        def.collision.length >= 6
          ? def.collision.slice()
          : def.hurt.length >= 6
            ? def.hurt.slice()
            : null;
      this.pendingDeathChunkSpawns.push({
        frameIndex: def.frame,
        pivotWorldX: sim.cx,
        pivotWorldY: sim.cy,
        vx: sim.vx + Math.cos(ang) * pop,
        vy: sim.vy + Math.sin(ang) * pop - 60,
        angleRad: (sim.angleDeg * Math.PI) / 180,
        omega: (sim.angleVel * Math.PI) / 180 + (Math.random() - 0.5) * 12,
        pivotX: def.pivotX,
        pivotY: def.pivotY,
        mirror: this.facingRight,
        hullLocal: hull,
      });
    }
  }

  private hpFrac(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  private aggression(): number {
    const f = this.hpFrac();
    if (f >= ENRAGE_HP_FRAC) return BASE_AGGRESSION;
    const ramp = (ENRAGE_HP_FRAC - f) / ENRAGE_HP_FRAC;
    return Math.max(0, Math.min(1, BASE_AGGRESSION + (1 - BASE_AGGRESSION) * ramp));
  }

  private moveSpeedMult(): number {
    return this.isShiny() ? SHINY_MOVE_SPEED_MULT : 1;
  }

  private kiteHpFrac(): number {
    return this.isShiny() ? SHINY_KITE_HP_FRAC : REACT_HP_FRAC;
  }

  private floatSpeed(): number {
    return FLOAT_SPEED * (1 + 0.65 * this.aggression()) * this.moveSpeedMult();
  }

  private randCooldown(): number {
    const base = SHOOT_CD_MIN + Math.random() * (SHOOT_CD_MAX - SHOOT_CD_MIN);
    return base * (1 - 0.5 * this.aggression());
  }

  private canDodgeAndCounter(): boolean {
    return this.isShiny() || this.hpFrac() <= REACT_HP_FRAC;
  }

  private tickMovement(dt: number): void {
    if (this.dashing) {
      this.facingRight = this.dashDirX > 0;
      this.vx = this.dashDirX * DASH_SPEED;
      this.vy = this.dashDirY * DASH_SPEED;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.clampAnchor();
      return;
    }

    this.phaseTimer -= dt;
    if (this.phaseTimer <= 0) this.advancePhase();

    this.orbitFlipTimer -= dt;
    if (this.orbitFlipTimer <= 0) {
      this.orbitDir = Math.random() < 0.5 ? 1 : -1;
      this.orbitFlipTimer = ORBIT_FLIP_MIN + Math.random() * (ORBIT_FLIP_MAX - ORBIT_FLIP_MIN);
    }

    let targetVx = 0;
    let targetVy = 0;
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;

    if (this.phase === "A") {
      if (Math.hypot(this.wanderTx - cx, this.wanderTy - cy) < 12) this.pickWanderTarget();
      const dx = this.wanderTx - cx;
      const dy = this.wanderTy - cy;
      const d = Math.hypot(dx, dy);
      if (d > 1e-3) {
        const sp = this.floatSpeed();
        targetVx = (dx / d) * sp;
        targetVy = (dy / d) * sp;
      }
    } else if (this.phase === "C") {
      targetVx = 0;
      targetVy = 0;
    } else if (this.visionSeesPlayer && Number.isFinite(this.playerCy)) {
      const dx = this.playerCx - cx;
      const dy = this.playerCy - cy;
      const d = Math.hypot(dx, dy);
      if (d > 1e-3) {
        const nx = dx / d;
        const ny = dy / d;
        let speed = this.floatSpeed();
        let radial: number;
        let tanFrac: number;
        const kite = this.hpFrac() <= this.kiteHpFrac() && d < KITE_RADIUS;
        if (kite) {
          radial = -1;
          tanFrac = 0.3;
          speed *= 1.35;
        } else if (d > STANDOFF + STANDOFF_PAD) {
          radial = 0.7;
          tanFrac = ORBIT_SPEED_FRAC;
        } else if (d < STANDOFF - STANDOFF_PAD) {
          radial = -0.7;
          tanFrac = ORBIT_SPEED_FRAC;
        } else {
          radial = 0;
          tanFrac = ORBIT_SPEED_FRAC;
        }
        const tx = -ny * this.orbitDir;
        const ty = nx * this.orbitDir;
        targetVx = (nx * radial + tx * tanFrac) * speed;
        targetVy = (ny * radial + ty * tanFrac) * speed;
      }
    }

    // Hold still during normal windup (not counter) and volley.
    const holdStill = (this.firing && !this.counterShot) || this.volleyRemaining > 0;
    if (holdStill) {
      targetVx = 0;
      targetVy = 0;
    }
    const lerp = Math.min(1, dt * (holdStill ? 9 : 4));
    this.vx += (targetVx - this.vx) * lerp;
    this.vy += (targetVy - this.vy) * lerp;

    if (this.visionSeesPlayer) this.facingRight = this.playerCx > cx;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.clampAnchor();
  }

  private advancePhase(): void {
    const agg = this.aggression();
    if (this.phase === "A") {
      // Shiny skips C and goes A→B (Java advancePhase).
      this.phase = this.isShiny() ? "B" : "C";
      this.phaseTimer = (6 + Math.random() * 3) * (1 - 0.5 * agg);
    } else if (this.phase === "C") {
      this.phase = "B";
      this.phaseTimer = (2 + Math.random()) * (1 + 0.8 * agg);
    } else {
      this.phase = "A";
      this.phaseTimer = 1.6 + Math.random() * 1.2;
      this.peeking = Math.random() < PEEK_CHANCE;
      this.pickWanderTarget();
    }
  }

  private pickWanderTarget(): void {
    const b = this.activeBounds();
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    if (this.peeking && Number.isFinite(this.playerCy)) {
      const midX = (b.minX + b.maxX) * 0.5;
      const midY = (b.minY + b.maxY) * 0.5;
      let ax = cx - this.playerCx;
      let ay = cy - this.playerCy;
      let d = Math.hypot(ax, ay);
      if (d < 1e-3) {
        ax = Math.random() < 0.5 ? 1 : -1;
        ay = Math.random() < 0.5 ? 1 : -1;
        d = Math.hypot(ax, ay);
      }
      ax /= d;
      ay /= d;
      this.wanderTx = Math.max(b.minX, Math.min(b.maxX, midX + ax * (b.maxX - b.minX) * 0.6));
      this.wanderTy = Math.max(b.minY, Math.min(b.maxY, midY + ay * (b.maxY - b.minY) * 0.6));
      return;
    }
    const pad = 8;
    const minX = b.minX + pad;
    const maxX = b.maxX - pad;
    const minY = b.minY + pad;
    const maxY = Math.min(b.maxY - pad, b.minY + (b.maxY - b.minY) * 0.7);
    this.wanderTx = minX + Math.random() * Math.max(8, maxX - minX);
    this.wanderTy = minY + Math.random() * Math.max(8, maxY - minY);
  }

  private activeBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (this.cameraView && this.cameraView.w > 0 && this.cameraView.h > 0) {
      return {
        minX: rectLeft(this.cameraView) + VIEW_MARGIN,
        minY: rectTop(this.cameraView) + VIEW_MARGIN,
        maxX: rectRight(this.cameraView) - VIEW_MARGIN,
        maxY: rectBottom(this.cameraView) - VIEW_MARGIN,
      };
    }
    return {
      minX: ROOM_MARGIN,
      minY: ROOM_MARGIN,
      maxX: this.mapW - ROOM_MARGIN,
      maxY: this.mapH - ROOM_MARGIN,
    };
  }

  private clampAnchor(): void {
    const b = this.activeBounds();
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    let ncx = Math.max(b.minX, Math.min(b.maxX, cx));
    let ncy = Math.max(b.minY, Math.min(b.maxY, cy));
    if (ncx !== cx) this.vx = 0;
    if (ncy !== cy) this.vy = 0;
    this.x = ncx - this.w * 0.5;
    this.y = ncy - this.h * 0.5;
  }

  private tickShooting(dt: number): void {
    if (this.hitstun > 0 || this.knockbackContactTimer > 0 || this.blackHeartBeat.isLocked()) return;

    if (this.dashing) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.dashing = false;
        this.releaseTimer = RELEASE_POSE_SEC;
        this.shootCooldown = this.randCooldown();
      }
      return;
    }

    this.shootCooldown -= dt;
    if (this.releaseTimer > 0) this.releaseTimer = Math.max(0, this.releaseTimer - dt);

    if (this.volleyRemaining > 0) {
      this.volleyTimer -= dt;
      if (this.volleyTimer <= 0) {
        this.lockAim();
        this.spawnBullet();
        this.volleyRemaining--;
        this.volleyTimer = VOLLEY_INTERVAL;
        if (this.volleyRemaining <= 0) {
          this.releaseTimer = RELEASE_POSE_SEC;
          this.shootCooldown = this.randCooldown();
        }
      }
      return;
    }

    if (this.firing) {
      this.lockAim();
      this.windupTimer -= dt;
      if (this.windupTimer <= 0) {
        this.firing = false;
        this.executeAttack();
      }
      return;
    }

    // Dodge + counter when low HP and player closing fast.
    if (
      this.canDodgeAndCounter() &&
      this.dodgeCooldown <= 0 &&
      this.visionSeesPlayer &&
      Number.isFinite(this.playerCy)
    ) {
      const cx = this.x + this.w * 0.5;
      const cy = this.y + this.h * 0.5;
      const dx = this.playerCx - cx;
      const dy = this.playerCy - cy;
      const d = Math.hypot(dx, dy);
      const closing = d > 1e-3 ? this.playerVx * (dx / d) + this.playerVy * (dy / d) : 0;
      if (d < THREAT_RADIUS && closing > 40) {
        this.doDodge(dx, dy, d);
        this.firing = true;
        this.counterShot = true;
        this.windupTimer = COUNTER_WINDUP;
        this.windupDuration = COUNTER_WINDUP;
        this.pendingAttack = "AIMED";
        this.lockAim();
        return;
      }
    }

    if (this.phase === "B" && this.visionSeesPlayer && this.shootCooldown <= 0) {
      this.firing = true;
      this.counterShot = false;
      this.pendingAttack = this.chooseAttack();
      let windup = WINDUP_SEC;
      if (this.pendingAttack === "NOVA") windup = WINDUP_SEC * NOVA_WINDUP_MULT;
      else if (this.pendingAttack === "DASH") windup = DASH_WINDUP;
      this.windupTimer = windup;
      this.windupDuration = windup;
      this.lockAim();
    }
  }

  private chooseAttack(): PossessedAttackType {
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    const dashDist = Number.isFinite(this.playerCy)
      ? Math.hypot(this.playerCx - cx, this.playerCy - cy)
      : STANDOFF;
    if (!this.isShiny()) {
      if (dashDist > DASH_MIN_RANGE && dashDist < DASH_MAX_RANGE && Math.random() < DASH_CHANCE) {
        return "DASH";
      }
      if (this.hpFrac() > PATTERN_HP_FRAC) {
        return Math.random() < 0.45 ? "VOLLEY" : "AIMED";
      }
    }
    // Shiny: always range-keyed (no dash / no high-HP AIMED-VOLLEY pool).
    const d = dashDist;
    if (d < STANDOFF * 0.75) return "NOVA";
    if (d < STANDOFF * 1.6) return Math.random() < 0.6 ? "FAN" : "VOLLEY";
    return Math.random() < 0.5 ? "VOLLEY" : "AIMED";
  }

  private executeAttack(): void {
    this.counterShot = false;
    switch (this.pendingAttack) {
      case "AIMED":
        this.spawnBullet();
        this.releaseTimer = RELEASE_POSE_SEC;
        this.shootCooldown = this.randCooldown();
        break;
      case "VOLLEY":
        this.volleyRemaining = this.aggression() > 0.4 ? 3 : 2;
        this.volleyTimer = 0;
        break;
      case "FAN":
        this.spawnFan();
        this.releaseTimer = RELEASE_POSE_SEC;
        this.shootCooldown = this.randCooldown();
        break;
      case "NOVA":
        this.spawnNova();
        this.releaseTimer = RELEASE_POSE_SEC;
        this.shootCooldown = this.randCooldown();
        break;
      case "DASH":
        this.startDash();
        break;
    }
  }

  private startDash(): void {
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    let dx: number;
    let dy: number;
    if (!Number.isFinite(this.playerCy)) {
      dx = this.facingRight ? 1 : -1;
      dy = 0;
    } else {
      dx = this.playerCx - cx;
      dy = this.playerCy - cy;
    }
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      dx = this.facingRight ? 1 : -1;
      dy = 0;
      d = 1;
    }
    this.dashDirX = dx / d;
    this.dashDirY = dy / d;
    this.dashing = true;
    this.dashTimer = DASH_SEC;
    this.contactActiveTimer = Math.max(this.contactActiveTimer, DASH_CONTACT);
    this.facingRight = this.dashDirX > 0;
  }

  private doDodge(dx: number, dy: number, d: number): void {
    if (this.isShiny()) {
      this.vy += -DODGE_IMPULSE * this.moveSpeedMult();
    } else {
      const nx = d > 1e-3 ? dx / d : 1;
      const ny = d > 1e-3 ? dy / d : 0;
      let px = -ny;
      let py = nx;
      if (px * this.playerVx + py * this.playerVy > 0) {
        px = -px;
        py = -py;
      }
      this.vx += px * DODGE_IMPULSE;
      this.vy += py * DODGE_IMPULSE;
    }
    this.dodgeCooldown = DODGE_COOLDOWN;
    this.contactActiveTimer = Math.max(this.contactActiveTimer, JUKE_CONTACT);
  }

  private lockAim(): void {
    if (this.counterShot && this.isShiny()) {
      this.aimDx = 0;
      this.aimDy = 1;
      return;
    }
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    let dx: number;
    let dy: number;
    if (!Number.isFinite(this.playerCy)) {
      dx = this.facingRight ? 1 : -1;
      dy = 0;
    } else {
      const tte = Math.min(
        LEAD_MAX_SEC,
        Math.hypot(this.playerCx - cx, this.playerCy - cy) / BULLET_SPEED,
      );
      dx = this.playerCx + this.playerVx * tte - cx;
      dy = this.playerCy + this.playerVy * tte - cy;
    }
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      dx = this.facingRight ? 1 : -1;
    }
    const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    this.aimDx = Math.cos(snapped);
    this.aimDy = Math.sin(snapped);
  }

  private spawnBulletAt(dirX: number, dirY: number): void {
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    this.bullets.push({
      x: cx,
      y: cy,
      vx: dirX * BULLET_SPEED,
      vy: dirY * BULLET_SPEED,
      age: 0,
      dead: false,
      hitPlayer: false,
    });
  }

  private spawnBullet(): void {
    this.spawnBulletAt(this.aimDx, this.aimDy);
  }

  private spawnFan(): void {
    const base = Math.atan2(this.aimDy, this.aimDx);
    const step = Math.PI / 4;
    for (const off of [-step, 0, step]) {
      const a = base + off;
      this.spawnBulletAt(Math.cos(a), Math.sin(a));
    }
  }

  private spawnNova(): void {
    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI / 4);
      this.spawnBulletAt(Math.cos(a), Math.sin(a));
    }
  }

  private tickBullets(dt: number, map: TileMap): void {
    const mapW = map.getWidth() * TILE_SIZE;
    const mapH = map.getHeight() * TILE_SIZE;
    for (const b of this.bullets) {
      if (b.dead) continue;
      if ((b.hitlagRemoveRemaining ?? 0) > 0) {
        b.hitlagRemoveRemaining = Math.max(0, (b.hitlagRemoveRemaining ?? 0) - dt);
        if (b.hitlagRemoveRemaining <= 0) b.dead = true;
        continue;
      }
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 8 || b.y < 8 || b.x > mapW - 8 || b.y > mapH - 8) {
        b.dead = true;
      }
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]!;
      if (!b.dead) continue;
      this.bulletDieFx.push({ x: b.x, y: b.y, age: 0 });
      this.bullets.splice(i, 1);
    }
  }

  private tickBulletDieFx(dt: number): void {
    for (const fx of this.bulletDieFx) fx.age += dt;
    for (let i = this.bulletDieFx.length - 1; i >= 0; i--) {
      if (this.bulletDieFx[i]!.age >= BULLET_DIE_MAX_AGE) this.bulletDieFx.splice(i, 1);
    }
  }

  private integrateParts(dt: number, map: TileMap | null): void {
    const rig = getPossessedRig();
    if (!rig || this.partSims.length === 0) return;
    this.ensureSims(rig);

    let poseName = this.currentPoseName();
    if (poseName === "dash_windup" || poseName === "dash") {
      poseName = poseFromSequence(rig, poseName, this.poseAnimProgress());
    }

    const ax = this.x + this.w * 0.5;
    const ay = this.y + this.h * 0.5;
    const m = this.facingRight ? -1 : 1;

    for (let i = 0; i < this.partSims.length; i++) {
      const def = rig.parts[i];
      const p = this.partSims[i]!;
      if (!def || def.name !== p.name) continue;

      const pe = poseOffset(rig, poseName, def.name);
      const bobAmp = rig.bobAmpPx * def.bobScale;
      const bx = bobAmp * Math.sin(this.bobTime * rig.bobSpeedRadPerSec + p.bobPhase);
      const by = bobAmp * Math.sin(this.bobTime * rig.bobSpeedRadPerSec * 1.3 + p.bobPhase * 1.7);
      const targetX = ax + m * pe.dx + bx;
      const targetY = ay + pe.dy + by;
      const targetA = pe.angleDeg;

      const k = p.loose ? LOOSE_K : SETTLED_K;
      const c = p.loose ? LOOSE_C : SETTLED_C;
      p.vx += ((targetX - p.cx) * k - p.vx * c) * dt;
      p.vy += ((targetY - p.cy) * k - p.vy * c) * dt;
      p.angleVel += ((targetA - p.angleDeg) * ANGLE_K - p.angleVel * ANGLE_C) * dt;
      p.angleDeg += p.angleVel * dt;

      if (p.loose) {
        this.moveLooseWithBounce(rig, i, p, def, dt, map);
        if (p.looseTimer > 0) p.looseTimer -= dt;
        const dist = Math.hypot(targetX - p.cx, targetY - p.cy);
        const sp = Math.hypot(p.vx, p.vy);
        if (p.looseTimer <= 0 && dist < 6 && sp < 24) {
          p.loose = false;
        }
      } else {
        p.cx += p.vx * dt;
        p.cy += p.vy * dt;
      }
    }
  }

  private moveLooseWithBounce(
    rig: PossessedRigData,
    index: number,
    p: PossessedPartSim,
    _def: PossessedPartDef,
    dt: number,
    map: TileMap | null,
  ): void {
    if (!map) {
      p.cx += p.vx * dt;
      p.cy += p.vy * dt;
      return;
    }
    // Already embedded in solid (boss phases through terrain) → free drift until clear.
    if (this.collisionHullHitsSolid(rig, index, p.cx, p.cy, p.angleDeg, map)) {
      p.cx += p.vx * dt;
      p.cy += p.vy * dt;
      return;
    }
    const nx = p.cx + p.vx * dt;
    if (this.collisionHullHitsSolid(rig, index, nx, p.cy, p.angleDeg, map)) {
      p.vx = -p.vx * WALL_REST;
    } else {
      p.cx = nx;
    }
    const ny = p.cy + p.vy * dt;
    if (this.collisionHullHitsSolid(rig, index, p.cx, ny, p.angleDeg, map)) {
      p.vy = -p.vy * FLOOR_REST;
    } else {
      p.cy = ny;
    }
  }

  private collisionHullHitsSolid(
    rig: PossessedRigData,
    index: number,
    cx: number,
    cy: number,
    angleDeg: number,
    map: TileMap,
  ): boolean {
    const def = rig.parts[index];
    if (!def) return false;
    const local = def.collision.length >= 6 ? def.collision : def.hurt;
    if (local.length < 6) return false;
    const m = this.facingRight ? -1 : 1;
    const world = transformHull(local, def.pivotX, def.pivotY, cx, cy, angleDeg, m);
    const b = polygonBounds(world);
    const ts = TILE_SIZE;
    const minTx = Math.floor(b.x / ts);
    const maxTx = Math.floor((b.x + b.w - 1e-9) / ts);
    const minTy = Math.floor(b.y / ts);
    const maxTy = Math.floor((b.y + b.h - 1e-9) / ts);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!map.isSolidTile(tx, ty)) continue;
        const tile: Aabb = { x: tx * ts, y: ty * ts, w: ts, h: ts };
        if (polygonIntersectsAabb(world, tile)) return true;
      }
    }
    return false;
  }

  addBulletDieFx(x: number, y: number): void {
    this.bulletDieFx.push({ x, y, age: 0 });
  }

  applyBulletHits(playerHurt: Aabb, onHit: (damage: number, bulletCx: number) => void): void {
    for (const b of this.bullets) {
      if (b.dead || b.hitPlayer) continue;
      const box: Aabb = {
        x: b.x - BULLET_HALF,
        y: b.y - BULLET_HALF,
        w: BULLET_HALF * 2,
        h: BULLET_HALF * 2,
      };
      if (!aabbOverlap(playerHurt, box)) continue;
      b.hitPlayer = true;
      b.dead = true;
      onHit(BULLET_DAMAGE, b.x);
    }
  }

  rect(): Aabb {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  contactDamagePose(): Aabb {
    const hit = this.bodyHitAabb();
    if (hit) return hit;
    return this.rect();
  }

  damageReceivePose(): Aabb {
    const union = this.unionHurtAabb();
    if (union) return union;
    return { x: this.x - 10, y: this.y - 14, w: this.w + 20, h: this.h + 18 };
  }

  intersectsAttack(sword: Aabb): boolean {
    return this.probeMeleeHurtParts(sword, false);
  }

  intersectsMeleePose(swordPose: HitboxPose): boolean {
    return this.probeMeleeHurtParts(swordPose, true);
  }

  /** Per-part hurt hull vs sword (Java intersectsAttack / intersectsProjectileOrAttackPose). */
  private probeMeleeHurtParts(sword: Aabb | HitboxPose, usePose: boolean): boolean {
    if (this.hp <= 0 || this.deathTimer >= 0) return false;
    this.lastStruckParts.length = 0;
    const rig = getPossessedRig();
    if (!rig || this.partSims.length === 0) {
      const recv = this.damageReceivePose();
      const hit = usePose
        ? (sword as HitboxPose).intersectsRect(recv)
        : aabbOverlap(sword as Aabb, recv);
      if (!hit) return false;
      const bodyIdx = this.partSims.findIndex((p) => p.name === "body");
      this.lastStruckParts.push(bodyIdx >= 0 ? bodyIdx : 0);
      return true;
    }
    this.ensureSims(rig);
    let any = false;
    for (let i = 0; i < this.partSims.length; i++) {
      const hurt = this.partWorldHurtPose(rig, i);
      if (!hurt) continue;
      const hit = usePose
        ? (sword as HitboxPose).intersects(hurt)
        : hurt.intersectsRect(sword as Aabb);
      if (!hit) continue;
      this.lastStruckParts.push(i);
      any = true;
    }
    if (!any) return false;
    return true;
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.hp <= 0 || this.deathTimer >= 0) return false;
    const struck = this.collectStruckParts(strike);
    this.hp = Math.max(0, this.hp - strike.damage);
    this.onDamaged(strike.freezeFrames);
    if (strike.knockKind === "black_heart_burst") {
      this.hitstun = queueBlackHeartBurstKnock(this.blackHeartBeat, strike, this.hitstun, this);
      if (this.hp <= 0) this.beginDeath();
      return true;
    }
    const away =
      this.x + this.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const attackerCx = strike.attackerX + strike.attackerW * 0.5;
    this.knockStruckParts(attackerCx, away, strike.damage, struck);
    if (this.hp <= 0) {
      this.beginDeath();
    }
    return true;
  }

  releaseBlackHeartBeatKnockback(): void {
    releaseBlackHeartBeatKnockback(this.blackHeartBeat, (vx, vy) => {
      this.vx = vx;
      this.vy = vy;
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
    if (this.hp <= 0 || this.deathTimer >= 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.onDamaged(strike.freezeFrames);
    const facing = strike.projectileVelX >= 0 ? 1 : -1;
    const attackerCx =
      strike.debrisCenterWorldX != null && Number.isFinite(strike.debrisCenterWorldX)
        ? strike.debrisCenterWorldX
        : facing >= 0
          ? -1e9
          : 1e9;
    const fakeStrike: WeaponStrike = {
      damage: strike.damage,
      freezeFrames: strike.freezeFrames,
      attackerX: attackerCx - 8,
      attackerW: 16,
      facing,
      knockKind: strike.knockKind,
      contactWorldX: strike.contactWorldX,
      contactWorldY: strike.contactWorldY,
    };
    const struck = this.collectStruckParts(fakeStrike);
    this.knockStruckParts(attackerCx, facing, strike.damage, struck);
    if (this.hp <= 0) {
      this.beginDeath();
    }
    return true;
  }

  /** Java onDamaged: freeze frames + hurt pose/tint + contact-disable window. */
  private onDamaged(freezeFrames: number): void {
    const stunSec = Math.max(0, freezeFrames) / 60;
    this.hitstun = Math.max(this.hitstun, stunSec);
    this.hitlagSolidRed = true;
    this.hurtTintRemaining = Math.max(this.hurtTintRemaining, HURT_TINT_SEC);
    this.hurtPoseTimer = HURT_POSE_SEC;
    this.knockbackContactTimer = Math.max(this.knockbackContactTimer, KNOCKBACK_CONTACT_DISABLE);
  }

  /** Body-part hit hull (Java contactDamagePose → partRolePose body "hit"). */
  private bodyHitAabb(): Aabb | null {
    const rig = getPossessedRig();
    if (!rig || this.partSims.length === 0) return null;
    this.ensureSims(rig);
    const bodyIdx = this.partSims.findIndex((p) => p.name === "body");
    const index = bodyIdx >= 0 ? bodyIdx : 0;
    return this.partWorldRoleAabb(rig, index, "hit") ?? this.partWorldRoleAabb(rig, index, "collision");
  }

  private unionHurtAabb(): Aabb | null {
    const rig = getPossessedRig();
    if (!rig || this.partSims.length === 0) return null;
    this.ensureSims(rig);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (let i = 0; i < this.partSims.length; i++) {
      const box = this.partWorldHurtAabb(rig, i);
      if (!box) continue;
      minX = Math.min(minX, box.x);
      maxX = Math.max(maxX, box.x + box.w);
      minY = Math.min(minY, box.y);
      maxY = Math.max(maxY, box.y + box.h);
      any = true;
    }
    if (!any) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private partWorldHurtAabb(rig: PossessedRigData, index: number): Aabb | null {
    return this.partWorldRoleAabb(rig, index, "hurt");
  }

  private partWorldHurtPose(rig: PossessedRigData, index: number): HitboxPose | null {
    const def = rig.parts[index];
    const sim = this.partSims[index];
    if (!def || !sim) return null;
    const local = def.hurt.length >= 6 ? def.hurt : def.collision;
    if (local.length < 6) return null;
    const m = this.facingRight ? -1 : 1;
    const world = transformHull(local, def.pivotX, def.pivotY, sim.cx, sim.cy, sim.angleDeg, m);
    return HitboxPose.fromWorldPolygon(world);
  }

  private partWorldRoleAabb(
    rig: PossessedRigData,
    index: number,
    role: "hurt" | "hit" | "collision",
  ): Aabb | null {
    const def = rig.parts[index];
    const sim = this.partSims[index];
    if (!def || !sim) return null;
    let local: ReadonlyArray<number>;
    if (role === "hurt") {
      local = def.hurt.length >= 6 ? def.hurt : def.collision;
    } else if (role === "hit") {
      local = def.hit.length >= 6 ? def.hit : def.collision;
    } else {
      local = def.collision.length >= 6 ? def.collision : def.hurt;
    }
    if (local.length < 6) {
      if (role === "hurt" && def.hurtAabb) return this.aabbFromHurtAabb(def, sim);
      return null;
    }
    const m = this.facingRight ? -1 : 1;
    const world = transformHull(local, def.pivotX, def.pivotY, sim.cx, sim.cy, sim.angleDeg, m);
    return polygonBounds(world);
  }

  private aabbFromHurtAabb(def: PossessedPartDef, sim: PossessedPartSim): Aabb {
    const hull = def.hurtAabb!;
    const m = this.facingRight ? -1 : 1;
    const left = sim.cx - def.pivotX;
    const top = sim.cy - def.pivotY;
    let hx0 = hull.minX;
    let hx1 = hull.maxX;
    if (m < 0) {
      hx0 = 2 * def.pivotX - hull.maxX;
      hx1 = 2 * def.pivotX - hull.minX;
    }
    const x0 = left + Math.min(hx0, hx1);
    const x1 = left + Math.max(hx0, hx1);
    return { x: x0, y: top + hull.minY, w: x1 - x0, h: hull.maxY - hull.minY };
  }

  private collectStruckParts(_strike: WeaponStrike): number[] {
    if (this.lastStruckParts.length > 0) return [...this.lastStruckParts];
    const bodyIdx = this.partSims.findIndex((p) => p.name === "body");
    return [bodyIdx >= 0 ? bodyIdx : 0];
  }

  private knockStruckParts(attackerCx: number, facing: number, dmg: number, struck: number[]): void {
    let impx = 0;
    let impy = 0;
    let cnt = 0;
    for (const i of struck) {
      const p = this.partSims[i];
      if (!p) continue;
      let dir: number;
      if (Math.abs(attackerCx) < 1e8) {
        dir = Math.sign(p.cx - attackerCx);
      } else {
        dir = facing >= 0 ? 1 : -1;
      }
      if (dir === 0) dir = facing >= 0 ? 1 : -1;
      const kx = dir * KNOCK_SPEED * (0.8 + 0.4 * Math.min(2, dmg));
      const ky = -KNOCK_UP;
      p.vx += kx;
      p.vy += ky;
      p.angleVel += (Math.random() - 0.5) * KNOCK_SPIN_DEG;
      p.loose = true;
      p.looseTimer = LOOSE_MIN_SEC;
      impx += kx;
      impy += ky;
      cnt++;
    }
    if (cnt > 0) {
      this.vx += (ANCHOR_TRAIL_FRAC * impx) / cnt;
      this.vy += (ANCHOR_TRAIL_FRAC * impy) / cnt;
    }
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.hp <= 0 || this.deathTimer >= 0) return false;
    if (this.contactActiveTimer <= 0) return false;
    if (this.hitstun > 0 || this.knockbackContactTimer > 0 || this.blackHeartBeat.isLocked()) return false;
    return aabbOverlap(playerHurt, this.contactDamagePose());
  }

  contactDamageToPlayer(): number {
    return 1;
  }

  getHealth(): number {
    return Math.max(0, this.hp);
  }

  getMaxHealth(): number {
    return this.maxHp;
  }

  isDead(): boolean {
    return this.deathTimer >= DEATH_REWARD_DELAY_SEC;
  }

  isDying(): boolean {
    return this.deathTimer >= 0;
  }

  deathProgress(): number {
    return this.deathTimer < 0 ? 0 : this.deathTimer;
  }

  isInCombatHitstun(): boolean {
    // Java: whole reeling window (hitstun + knockback contact disable + black-heart beat).
    return this.hitstun > 0 || this.knockbackContactTimer > 0 || this.blackHeartBeat.isLocked();
  }

  facingSign(): number {
    // Art faces left; facingRight mirrors (Java hitboxFacingSign / partRenders.mirror).
    return this.facingRight ? -1 : 1;
  }

  /** Remaining hurt-fade tint seconds (Java getHurtTint). */
  getHurtTint(): number {
    return this.hurtTintRemaining;
  }

  hurtTintAlpha(): number {
    if (this.hurtTintRemaining <= 0) return 0;
    return Math.round(HURT_TINT_PEAK_ALPHA * (this.hurtTintRemaining / HURT_TINT_SEC));
  }

  /** True while freeze frames remain (Java hitstunSolidRed). */
  hitstunSolidRed(): boolean {
    return this.hitlagSolidRed && this.hitstun > 0 && this.hp > 0;
  }

  blocksRoomClear(): boolean {
    return !this.isDead();
  }

  attackBlockedByShield(_attack: Aabb): boolean {
    return false;
  }

  applyShieldBlockStrike(_strike: WeaponStrike): void {}
}

/** Palette index 0..3 from wind-up progress (ends on white right before the nova fires). */
function novaChargePaletteIndex(progress: number): number {
  if (progress >= 0.92) return NOVA_SPRITE_PALETTE.length - 1;
  return Math.min(
    NOVA_SPRITE_PALETTE.length - 1,
    Math.floor(progress * NOVA_SPRITE_PALETTE.length),
  );
}

function novaChargePaletteRgb(progress: number): number {
  return NOVA_SPRITE_PALETTE[novaChargePaletteIndex(progress)]!;
}

/** Mirror + rotate texture-local hull about pivot into world (Java transformHull). */
function transformHull(
  local: ReadonlyArray<number>,
  pivotX: number,
  pivotY: number,
  cx: number,
  cy: number,
  angleDeg: number,
  m: number,
): number[] {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const out: number[] = new Array(local.length);
  for (let i = 0; i < local.length; i += 2) {
    const lx = (local[i]! - pivotX) * m;
    const ly = local[i + 1]! - pivotY;
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    out[i] = cx + rx;
    out[i + 1] = cy + ry;
  }
  return out;
}

/** Quantize angle so farthest pixel advances in whole-world-pixel steps (Java snapAngleToPixels). */
function snapAngleToPixels(
  angleRad: number,
  frameW: number,
  frameH: number,
  pivotX: number,
  pivotY: number,
): number {
  let r = 0;
  const corners: Array<[number, number]> = [
    [0, 0],
    [frameW, 0],
    [0, frameH],
    [frameW, frameH],
  ];
  for (const c of corners) {
    r = Math.max(r, Math.hypot(c[0] - pivotX, c[1] - pivotY));
  }
  if (r < 1e-6) return angleRad;
  const step = 1 / r;
  return Math.round(angleRad / step) * step;
}
