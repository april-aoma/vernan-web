import {
  aabbOverlap,
  knockbackFor,
  type Aabb,
  type WeaponStrike,
} from "../combat/CombatMath";
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
import { getPossessedRig, poseOffset } from "../boss/PossessedRig";
import { BrickChunk } from "../fx/BrickChunk";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";

const FLOAT_SPEED = 55;
const STANDOFF = 60;
const STANDOFF_PAD = 26;
const ROOM_MARGIN = 18;
const VIEW_MARGIN = 28;
const DEATH_REWARD_DELAY_SEC = 4.0;
const BASE_AGGRESSION = 0.25;
const ENRAGE_HP_FRAC = 0.5;
const ORBIT_SPEED_FRAC = 0.85;
const ORBIT_FLIP_MIN = 1.4;
const ORBIT_FLIP_MAX = 3.2;
const WINDUP_SEC = 0.6;
const NOVA_WINDUP_MULT = 2;
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
const BULLET_HALF = 3;
const PEEK_CHANCE = 0.5;
const SETTLED_K = 220;
const SETTLED_C = 2 * Math.sqrt(SETTLED_K);
const LOOSE_K = 40;
const LOOSE_C = 2 * Math.sqrt(LOOSE_K);
const ANGLE_K = 200;
const ANGLE_C = 2 * Math.sqrt(ANGLE_K);
const KNOCK_SPEED = 170;
const KNOCK_UP = 70;
const KNOCK_SPIN_DEG = 520;
const LOOSE_MIN_SEC = 0.22;
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
};

export type PossessedBulletDieFx = {
  x: number;
  y: number;
  age: number;
};

/** Per-part draw offset / spin for light knock-loose (no wall bounce). */
export type PossessedPartSim = {
  name: string;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  angleDeg: number;
  angleVel: number;
  loose: boolean;
  looseTimer: number;
};

/**
 * Phase 5b Possessed — Java combat parity (aimed/volley/fan/nova/dash, kite, dodge+counter).
 * Light knock-loose limbs + shiny AI; full PartSim wall bounce / scanline still stubbed.
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
  private hitstun = 0;
  private deathTimer = -1;
  private flash = 0;
  private hurtPoseTimer = 0;
  private knockbackContactTimer = 0;
  private contactActiveTimer = 0;
  private dodgeCooldown = 0;
  private mapW = 256;
  private mapH = 256;
  private cameraView: WorldRect | null = null;
  private seesPlayer = false;
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
  private pendingDeathChunks: BrickChunk[] | null = null;
  /** Last sword AABB that overlapped (from intersectsAttack) for knock-loose targeting. */
  private lastSwordProbe: Aabb | null = null;

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

  /** Drain death BrickChunks once (mount pushes into brickChunks[]). */
  takeDeathDebris(): BrickChunk[] | null {
    const chunks = this.pendingDeathChunks;
    this.pendingDeathChunks = null;
    return chunks;
  }

  private initPartSims(): void {
    const rig = getPossessedRig();
    const names = rig?.parts.map((p) => p.name) ?? ["head", "body", "handL", "handR"];
    this.partSims.length = 0;
    for (const name of names) {
      this.partSims.push({
        name,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
        angleDeg: 0,
        angleVel: 0,
        loose: false,
        looseTimer: 0,
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
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    this.seesPlayer = seesPlayerAt(cx, cy, player.cx, player.cy, seeRadius);
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

  update(dt: number, map: TileMap, _playerX: number): void {
    this.bobTime += dt;
    this.hurtPoseTimer = Math.max(0, this.hurtPoseTimer - dt);
    this.knockbackContactTimer = Math.max(0, this.knockbackContactTimer - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.contactActiveTimer = Math.max(0, this.contactActiveTimer - dt);
    this.tickPartSims(dt);
    this.tickBulletDieFx(dt);

    if (this.deathTimer >= 0) {
      this.deathTimer += dt;
      this.maybeQueueDeathDebris();
      this.tickBullets(dt, map);
      return;
    }
    if (this.hp <= 0) {
      this.beginDeath();
      this.tickBullets(dt, map);
      return;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.hitstun > 0) {
      this.hitstun = Math.max(0, this.hitstun - dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.clampAnchor();
      this.tickBullets(dt, map);
      return;
    }

    this.tickMovement(dt);
    this.tickShooting(dt);
    this.tickBullets(dt, map);
  }

  private beginDeath(): void {
    this.deathTimer = 0;
    this.firing = false;
    this.dashing = false;
    this.contactActiveTimer = 0;
    this.bullets.length = 0;
    this.maybeQueueDeathDebris();
  }

  private maybeQueueDeathDebris(): void {
    if (this.deathDebrisSpawned) return;
    this.deathDebrisSpawned = true;
    const rig = getPossessedRig();
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    const mirrorX = this.facingSign() < 0 ? -1 : 1;
    const poseName = this.currentPoseName();
    const chunks: BrickChunk[] = [];
    const parts = rig?.parts ?? [
      { name: "head", pivotX: 8, pivotY: 8 },
      { name: "body", pivotX: 8, pivotY: 8 },
      { name: "handL", pivotX: 8, pivotY: 8 },
      { name: "handR", pivotX: 8, pivotY: 8 },
    ];
    const colors = ["#c8a0e8", "#a070c8", "#e0c0ff", "#9070b0"];
    for (let i = 0; i < Math.min(4, parts.length); i++) {
      const part = parts[i]!;
      const pe = rig ? poseOffset(rig, poseName, part.name) : { dx: 0, dy: 0, angleDeg: 0 };
      const sim = this.partSims.find((p) => p.name === part.name);
      const px = cx + mirrorX * pe.dx + (sim?.ox ?? 0);
      const py = cy + pe.dy + (sim?.oy ?? 0);
      const ang = Math.random() * Math.PI * 2;
      const pop = 90 + Math.random() * 70;
      const chunkVx = (sim?.vx ?? 0) + Math.cos(ang) * pop;
      const chunkVy = (sim?.vy ?? 0) + Math.sin(ang) * pop - 60;
      chunks.push(
        new BrickChunk(
          px - 4,
          py - 4,
          chunkVx,
          chunkVy,
          ((sim?.angleDeg ?? 0) * Math.PI) / 180,
          ((sim?.angleVel ?? 0) * Math.PI) / 180 + (Math.random() - 0.5) * 12,
          colors[i % colors.length]!,
          null,
        ),
      );
    }
    this.pendingDeathChunks = chunks;
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
    } else if (this.seesPlayer && Number.isFinite(this.playerCy)) {
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

    if (this.seesPlayer) this.facingRight = this.playerCx > cx;

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
    if (this.hitstun > 0 || this.knockbackContactTimer > 0) return;

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
      this.seesPlayer &&
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

    if (this.phase === "B" && this.seesPlayer && this.shootCooldown <= 0) {
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

  private tickPartSims(dt: number): void {
    for (const p of this.partSims) {
      if (p.looseTimer > 0) p.looseTimer = Math.max(0, p.looseTimer - dt);
      const k = p.loose ? LOOSE_K : SETTLED_K;
      const c = p.loose ? LOOSE_C : SETTLED_C;
      p.vx += (-p.ox * k - p.vx * c) * dt;
      p.vy += (-p.oy * k - p.vy * c) * dt;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      p.angleVel += (-p.angleDeg * ANGLE_K - p.angleVel * ANGLE_C) * dt;
      p.angleDeg += p.angleVel * dt;
      if (
        p.loose &&
        p.looseTimer <= 0 &&
        Math.hypot(p.ox, p.oy) < 6 &&
        Math.hypot(p.vx, p.vy) < 24
      ) {
        p.loose = false;
      }
    }
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
    return this.rect();
  }

  damageReceivePose(): Aabb {
    const union = this.unionHurtAabb();
    if (union) return union;
    return { x: this.x - 10, y: this.y - 14, w: this.w + 20, h: this.h + 18 };
  }

  intersectsAttack(sword: Aabb): boolean {
    if (this.hp <= 0 || this.deathTimer >= 0) return false;
    if (!aabbOverlap(sword, this.damageReceivePose())) return false;
    this.lastSwordProbe = { x: sword.x, y: sword.y, w: sword.w, h: sword.h };
    return true;
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.hp <= 0 || this.deathTimer >= 0) return false;
    const struck = this.collectStruckParts(strike);
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.15, strike.freezeFrames / 60);
    this.flash = 0.12;
    this.hurtPoseTimer = HURT_POSE_SEC;
    this.knockbackContactTimer = Math.max(this.knockbackContactTimer, KNOCKBACK_CONTACT_DISABLE);
    this.firing = false;
    this.volleyRemaining = 0;
    this.counterShot = false;
    if (this.dashing) {
      this.dashing = false;
      this.dashTimer = 0;
    }
    const away =
      this.x + this.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = knockbackFor(strike.knockKind, away);
    this.vx = kb.vx * 0.45;
    this.vy = kb.vy * 0.35;
    this.knockStruckParts(away, strike.damage, struck);
    if (this.hp <= 0) {
      this.beginDeath();
    }
    return true;
  }

  private unionHurtAabb(): Aabb | null {
    const rig = getPossessedRig();
    if (!rig || this.partSims.length === 0) return null;
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    const mirrorX = this.facingSign() < 0 ? -1 : 1;
    const poseName = this.currentPoseName();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (const part of rig.parts) {
      const hull = part.hurtAabb;
      if (!hull) continue;
      const pe = poseOffset(rig, poseName, part.name);
      const sim = this.partSims.find((p) => p.name === part.name);
      const partCx = cx + mirrorX * pe.dx + (sim?.ox ?? 0);
      const partCy = cy + pe.dy + (sim?.oy ?? 0);
      const left = partCx - part.pivotX;
      const top = partCy - part.pivotY;
      // Hull is texture-local; when mirrored, flip X around pivot.
      let hx0 = hull.minX;
      let hx1 = hull.maxX;
      if (mirrorX < 0) {
        hx0 = 2 * part.pivotX - hull.maxX;
        hx1 = 2 * part.pivotX - hull.minX;
      }
      const a = left + Math.min(hx0, hx1);
      const b = left + Math.max(hx0, hx1);
      const c = top + hull.minY;
      const d = top + hull.maxY;
      minX = Math.min(minX, a);
      maxX = Math.max(maxX, b);
      minY = Math.min(minY, c);
      maxY = Math.max(maxY, d);
      any = true;
    }
    if (!any) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private partWorldHurtAabb(
    rig: NonNullable<ReturnType<typeof getPossessedRig>>,
    partName: string,
  ): Aabb | null {
    const part = rig.parts.find((p) => p.name === partName);
    if (!part?.hurtAabb) return null;
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    const mirrorX = this.facingSign() < 0 ? -1 : 1;
    const pe = poseOffset(rig, this.currentPoseName(), partName);
    const sim = this.partSims.find((p) => p.name === partName);
    const partCx = cx + mirrorX * pe.dx + (sim?.ox ?? 0);
    const partCy = cy + pe.dy + (sim?.oy ?? 0);
    const left = partCx - part.pivotX;
    const top = partCy - part.pivotY;
    const hull = part.hurtAabb;
    let hx0 = hull.minX;
    let hx1 = hull.maxX;
    if (mirrorX < 0) {
      hx0 = 2 * part.pivotX - hull.maxX;
      hx1 = 2 * part.pivotX - hull.minX;
    }
    const x0 = left + Math.min(hx0, hx1);
    const x1 = left + Math.max(hx0, hx1);
    return { x: x0, y: top + hull.minY, w: x1 - x0, h: hull.maxY - hull.minY };
  }

  private collectStruckParts(strike: WeaponStrike): number[] {
    const rig = getPossessedRig();
    let sword = this.lastSwordProbe;
    if (!sword && strike.contactWorldX != null && strike.contactWorldY != null) {
      sword = {
        x: strike.contactWorldX - 4,
        y: strike.contactWorldY - 4,
        w: 8,
        h: 8,
      };
    }
    if (!sword) {
      sword = {
        x: strike.attackerX,
        y: this.y - 8,
        w: Math.max(16, strike.attackerW),
        h: this.h + 16,
      };
    }
    const struck: number[] = [];
    if (rig) {
      for (let i = 0; i < this.partSims.length; i++) {
        const sim = this.partSims[i]!;
        const box = this.partWorldHurtAabb(rig, sim.name);
        if (box && aabbOverlap(sword, box)) struck.push(i);
      }
    }
    if (struck.length === 0) {
      const bodyIdx = this.partSims.findIndex((p) => p.name === "body");
      struck.push(bodyIdx >= 0 ? bodyIdx : 0);
    }
    return struck;
  }

  private knockStruckParts(dir: number, dmg: number, struck: number[]): void {
    const scale = 0.8 + 0.4 * Math.min(2, dmg);
    for (const i of struck) {
      const p = this.partSims[i];
      if (!p) continue;
      p.vx += dir * KNOCK_SPEED * scale;
      p.vy += -KNOCK_UP;
      p.angleVel += (Math.random() - 0.5) * KNOCK_SPIN_DEG;
      p.loose = true;
      p.looseTimer = LOOSE_MIN_SEC;
    }
  }

  hurtsPlayer(playerHurt: Aabb): boolean {
    if (this.hp <= 0 || this.deathTimer >= 0) return false;
    if (this.contactActiveTimer <= 0) return false;
    if (this.hitstun > 0 || this.knockbackContactTimer > 0) return false;
    return aabbOverlap(playerHurt, this.contactDamagePose());
  }

  contactDamageToPlayer(): number {
    return 1;
  }

  getHealth(): number {
    return Math.max(0, this.hp);
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
    return this.hitstun > 0 || this.knockbackContactTimer > 0;
  }

  facingSign(): number {
    // Art faces left; facingRight mirrors (Java hitboxFacingSign / partRenders.mirror).
    return this.facingRight ? -1 : 1;
  }

  flashVisible(): boolean {
    if (this.hitstun > 0) return false;
    return this.flash > 0 && Math.floor(this.flash * 30) % 2 === 0;
  }

  hitlagSolidRed(): boolean {
    return this.hitstun > 0 && this.hp > 0;
  }

  blocksRoomClear(): boolean {
    return !this.isDead();
  }
}
