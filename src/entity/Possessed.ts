import {
  aabbOverlap,
  knockbackFor,
  type Aabb,
  type WeaponStrike,
} from "../combat/CombatMath";
import {
  rectBottom,
  rectLeft,
  rectRight,
  rectTop,
  seesPlayerAt,
  type PlayerCombatSnapshot,
  type WorldRect,
} from "../combat/EnemyVision";
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
const SHOOT_CD_MIN = 1.2;
const SHOOT_CD_MAX = 2.0;
const BULLET_SPEED = 110;
const BULLET_DAMAGE = 1;
const LEAD_MAX_SEC = 0.55;
const VOLLEY_INTERVAL = 0.11;
const PATTERN_HP_FRAC = 1 / 3;
const BULLET_HALF = 3;

type Phase = "A" | "B" | "C";
type AttackType = "AIMED" | "VOLLEY";

export type PossessedBullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  dead: boolean;
  hitPlayer: boolean;
};

/**
 * Phase 5b Possessed — viewport clamp, vision, orbit standoff, aimed/volley bullets.
 * Multi-part rig / nova / dash stubbed.
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
  private phase: Phase = "A";
  private phaseTimer = 2.0;
  private wanderTx = 0;
  private wanderTy = 0;
  private hitstun = 0;
  private deathTimer = -1;
  private flash = 0;
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
  private pendingAttack: AttackType = "AIMED";
  private volleyRemaining = 0;
  private volleyTimer = 0;
  private aimDx = 1;
  private aimDy = 0;
  private readonly bullets: PossessedBullet[] = [];

  constructor(centerX: number, centerY: number, maxHp: number) {
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.x = centerX - this.w * 0.5;
    this.y = centerY - this.h * 0.5;
    this.wanderTx = centerX;
    this.wanderTy = centerY;
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

  /** Live bullets for draw / collision. */
  bulletsCopy(): readonly PossessedBullet[] {
    return this.bullets;
  }

  isWindingUp(): boolean {
    return this.firing;
  }

  update(dt: number, map: TileMap, _playerX: number): void {
    if (this.deathTimer >= 0) {
      this.deathTimer += dt;
      this.tickBullets(dt, map);
      return;
    }
    if (this.hp <= 0) {
      this.deathTimer = 0;
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

  private hpFrac(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  private aggression(): number {
    const f = this.hpFrac();
    if (f >= ENRAGE_HP_FRAC) return BASE_AGGRESSION;
    const ramp = (ENRAGE_HP_FRAC - f) / ENRAGE_HP_FRAC;
    return Math.max(0, Math.min(1, BASE_AGGRESSION + (1 - BASE_AGGRESSION) * ramp));
  }

  private floatSpeed(): number {
    return FLOAT_SPEED * (1 + 0.65 * this.aggression());
  }

  private randCooldown(): number {
    const base = SHOOT_CD_MIN + Math.random() * (SHOOT_CD_MAX - SHOOT_CD_MIN);
    return base * (1 - 0.5 * this.aggression());
  }

  private tickMovement(dt: number): void {
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
        if (d > STANDOFF + STANDOFF_PAD) {
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

    const holdStill = this.firing || this.volleyRemaining > 0;
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
      this.phase = "C";
      this.phaseTimer = (6 + Math.random() * 3) * (1 - 0.5 * agg);
    } else if (this.phase === "C") {
      this.phase = "B";
      this.phaseTimer = (2 + Math.random()) * (1 + 0.8 * agg);
    } else {
      this.phase = "A";
      this.phaseTimer = 1.6 + Math.random() * 1.2;
      this.pickWanderTarget();
    }
  }

  private pickWanderTarget(): void {
    const b = this.activeBounds();
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
    this.shootCooldown -= dt;

    if (this.volleyRemaining > 0) {
      this.volleyTimer -= dt;
      if (this.volleyTimer <= 0) {
        this.lockAim();
        this.spawnBullet();
        this.volleyRemaining--;
        this.volleyTimer = VOLLEY_INTERVAL;
        if (this.volleyRemaining <= 0) this.shootCooldown = this.randCooldown();
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

    if (this.phase === "B" && this.seesPlayer && this.shootCooldown <= 0) {
      this.firing = true;
      this.pendingAttack = this.chooseAttack();
      this.windupTimer = WINDUP_SEC;
      this.lockAim();
    }
  }

  private chooseAttack(): AttackType {
    if (this.hpFrac() > PATTERN_HP_FRAC) {
      return Math.random() < 0.45 ? "VOLLEY" : "AIMED";
    }
    // Low HP: more volleys
    return Math.random() < 0.65 ? "VOLLEY" : "AIMED";
  }

  private executeAttack(): void {
    if (this.pendingAttack === "VOLLEY") {
      this.volleyRemaining = this.aggression() > 0.4 ? 3 : 2;
      this.volleyTimer = 0;
      this.lockAim();
      this.spawnBullet();
      this.volleyRemaining--;
      this.volleyTimer = VOLLEY_INTERVAL;
      if (this.volleyRemaining <= 0) this.shootCooldown = this.randCooldown();
    } else {
      this.lockAim();
      this.spawnBullet();
      this.shootCooldown = this.randCooldown();
    }
  }

  private lockAim(): void {
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

  private spawnBullet(): void {
    const cx = this.x + this.w * 0.5;
    const cy = this.y + this.h * 0.5;
    this.bullets.push({
      x: cx,
      y: cy,
      vx: this.aimDx * BULLET_SPEED,
      vy: this.aimDy * BULLET_SPEED,
      age: 0,
      dead: false,
      hitPlayer: false,
    });
  }

  private tickBullets(dt: number, map: TileMap): void {
    const mapW = map.getWidth() * TILE_SIZE;
    const mapH = map.getHeight() * TILE_SIZE;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Boundary walls only (Java possessed bullets phase through interior).
      if (b.x < 8 || b.y < 8 || b.x > mapW - 8 || b.y > mapH - 8) {
        b.dead = true;
      }
    }
    // Cull dead after draw opportunity — keep briefly? Instant cull is fine.
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (this.bullets[i]!.dead) this.bullets.splice(i, 1);
    }
  }

  /** Apply bullet↔player hits; returns true if any damage landed. */
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
    return { x: this.x - 2, y: this.y - 2, w: this.w + 4, h: this.h + 4 };
  }

  intersectsAttack(sword: Aabb): boolean {
    return this.hp > 0 && this.deathTimer < 0 && aabbOverlap(sword, this.damageReceivePose());
  }

  applyWeaponStrike(strike: WeaponStrike): boolean {
    if (this.hp <= 0 || this.deathTimer >= 0) return false;
    this.hp = Math.max(0, this.hp - strike.damage);
    this.hitstun = Math.max(0.15, strike.freezeFrames / 60);
    this.flash = 0.12;
    this.firing = false;
    this.volleyRemaining = 0;
    const away =
      this.x + this.w * 0.5 >= strike.attackerX + strike.attackerW * 0.5 ? 1 : -1;
    const kb = knockbackFor(strike.knockKind, away);
    this.vx = kb.vx * 0.45;
    this.vy = kb.vy * 0.35;
    if (this.hp <= 0) this.deathTimer = 0;
    return true;
  }

  hurtsPlayer(_playerHurt: Aabb): boolean {
    // Java: body contact off except dodge/dash windows — stub those, so no contact.
    return false;
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
    return this.hitstun > 0;
  }

  facingSign(): number {
    return this.facingRight ? 1 : -1;
  }

  flashVisible(): boolean {
    // Prefer solid-red hitstun look; keep brief white pulse only outside hitstun.
    if (this.hitstun > 0) return false;
    return this.flash > 0 && Math.floor(this.flash * 30) % 2 === 0;
  }

  /** Solid red during defensive hitstun (Java hitstunSolidRed). */
  hitlagSolidRed(): boolean {
    return this.hitstun > 0 && this.hp > 0;
  }

  blocksRoomClear(): boolean {
    return !this.isDead();
  }
}
