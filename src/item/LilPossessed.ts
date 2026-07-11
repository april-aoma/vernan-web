import {
  loadPossessedStyleRig,
  poseOffset,
  type PossessedRigData,
} from "../boss/PossessedRig";
import type { TileMap } from "../world/TileMap";
import { TILE_SIZE } from "../specs";

export type LilPossessedBullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  dead: boolean;
};

export type LilPossessedPartRender = {
  frame: number;
  cx: number;
  cy: number;
  angleRad: number;
  mirror: boolean;
  pivotX: number;
  pivotY: number;
};

type PartSim = {
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  angleDeg: number;
  angleVel: number;
  bobPhase: number;
  prevCx: number;
  prevCy: number;
  prevAngle: number;
};

const PART_K = 220;
const PART_C = 2 * Math.sqrt(PART_K);
const ANGLE_K = 200;
const ANGLE_C = 2 * Math.sqrt(ANGLE_K);
const FOLLOW_K = 95;
const FOLLOW_C = 2 * Math.sqrt(FOLLOW_K);
const BULLET_SPEED = 105;
export const LIL_POSSESSED_SHOOT_COOLDOWN_SEC = 0.9;
const FIRE_POSE_SEC = 0.14;
const MOVE_FACING_VEL = 2;
export const LIL_POSSESSED_BULLET_DAMAGE = 0.5;
export const LIL_POSSESSED_RIG_PATH = "sprites/lil possessed friend.rig.json";

/** Lil Possessed familiar (Java LilPossessed). */
export class LilPossessed {
  x: number;
  y: number;
  private vx = 0;
  private vy = 0;
  private sims: PartSim[] = [];
  private simNames: string[] = [];
  private bodyIndex = 0;
  private bobTime = 0;
  private facingRight = false;
  private shootCooldown = 0;
  private firePoseTimer = 0;
  private readonly bullets: LilPossessedBullet[] = [];
  private rig: PossessedRigData | null = null;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  async loadRig(assets: {
    loadJson: <T = unknown>(relPath: string) => Promise<T>;
  }): Promise<void> {
    this.rig = await loadPossessedStyleRig(assets, LIL_POSSESSED_RIG_PATH);
    this.ensureSims();
  }

  snapTo(px: number, py: number): void {
    this.x = px;
    this.y = py;
    this.vx = 0;
    this.vy = 0;
    this.bullets.length = 0;
    this.sims = [];
    this.simNames = [];
    this.ensureSims();
  }

  bulletsCopy(): readonly LilPossessedBullet[] {
    return this.bullets;
  }

  update(
    dt: number,
    followX: number,
    followY: number,
    fireEdge: boolean,
    aimX: number,
    aimY: number,
    map: TileMap,
  ): void {
    this.ensureSims();
    this.bobTime += dt;
    this.firePoseTimer = Math.max(0, this.firePoseTimer - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    this.vx += ((followX - this.x) * FOLLOW_K - this.vx * FOLLOW_C) * dt;
    this.vy += ((followY - this.y) * FOLLOW_K - this.vy * FOLLOW_C) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (fireEdge && this.shootCooldown <= 0) {
      this.shootCooldown = LIL_POSSESSED_SHOOT_COOLDOWN_SEC;
      this.firePoseTimer = FIRE_POSE_SEC;
      this.fireAt(aimX, aimY);
    }

    this.updateFacing(aimX);
    this.integrateParts(dt);
    this.tickBullets(dt, map);
  }

  partRenders(): LilPossessedPartRender[] {
    const rig = this.rig;
    if (!rig) return [];
    const out: LilPossessedPartRender[] = [];
    for (const name of rig.drawOrder) {
      const idx = this.simNames.indexOf(name);
      if (idx < 0) continue;
      const def = rig.parts[idx]!;
      const p = this.sims[idx]!;
      out.push({
        frame: def.frame,
        cx: p.cx,
        cy: p.cy,
        angleRad: (p.angleDeg * Math.PI) / 180,
        mirror: this.facingRight,
        pivotX: def.pivotX,
        pivotY: def.pivotY,
      });
    }
    return out;
  }

  private fireAt(targetX: number, targetY: number): void {
    const body = this.sims[this.bodyIndex];
    if (!body) return;
    let dx = targetX - body.cx;
    let dy = targetY - body.cy;
    if (Math.abs(dx) > 1e-6) this.facingRight = dx > 0;
    else if (Math.abs(dy) < 1e-6) dx = this.facingRight ? 1 : -1;
    const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    this.bullets.push({
      x: body.cx,
      y: body.cy,
      vx: Math.cos(snapped) * BULLET_SPEED,
      vy: Math.sin(snapped) * BULLET_SPEED,
      age: 0,
      dead: false,
    });
  }

  private updateFacing(aimX: number): void {
    if (Math.abs(this.vx) > MOVE_FACING_VEL) {
      this.facingRight = this.vx > 0;
      return;
    }
    if (this.firePoseTimer > 0) {
      const adx = aimX - this.x;
      if (Math.abs(adx) > 1e-6) this.facingRight = adx > 0;
    }
  }

  private ensureSims(): void {
    const rig = this.rig;
    if (!rig) return;
    if (this.sims.length === rig.parts.length) {
      let same = true;
      for (let i = 0; i < this.sims.length; i++) {
        if (this.simNames[i] !== rig.parts[i]!.name) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    this.sims = [];
    this.simNames = [];
    const mirror = this.facingRight ? -1 : 1;
    for (let i = 0; i < rig.parts.length; i++) {
      const def = rig.parts[i]!;
      const pe = poseOffset(rig, "idle", def.name);
      const p: PartSim = {
        cx: this.x + mirror * pe.dx,
        cy: this.y + pe.dy,
        vx: 0,
        vy: 0,
        angleDeg: pe.angleDeg,
        angleVel: 0,
        bobPhase: i * 1.7,
        prevCx: 0,
        prevCy: 0,
        prevAngle: 0,
      };
      p.prevCx = p.cx;
      p.prevCy = p.cy;
      p.prevAngle = p.angleDeg;
      this.sims.push(p);
      this.simNames.push(def.name);
      if (def.name === "body") this.bodyIndex = i;
    }
  }

  private integrateParts(dt: number): void {
    const rig = this.rig;
    if (!rig) return;
    const poseName = this.firePoseTimer > 0 ? "fire" : "idle";
    const mirror = this.facingRight ? -1 : 1;
    for (let i = 0; i < this.sims.length; i++) {
      const def = rig.parts[i]!;
      const p = this.sims[i]!;
      const pe = poseOffset(rig, poseName, def.name);
      const bobAmp = rig.bobAmpPx * def.bobScale;
      const bx = bobAmp * Math.sin(this.bobTime * rig.bobSpeedRadPerSec + p.bobPhase);
      const by =
        bobAmp * Math.sin(this.bobTime * rig.bobSpeedRadPerSec * 1.3 + p.bobPhase * 1.7);
      const targetX = this.x + mirror * pe.dx + bx;
      const targetY = this.y + pe.dy + by;
      p.vx += ((targetX - p.cx) * PART_K - p.vx * PART_C) * dt;
      p.vy += ((targetY - p.cy) * PART_K - p.vy * PART_C) * dt;
      p.angleVel += ((pe.angleDeg - p.angleDeg) * ANGLE_K - p.angleVel * ANGLE_C) * dt;
      p.angleDeg += p.angleVel * dt;
      p.cx += p.vx * dt;
      p.cy += p.vy * dt;
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
      if (b.x < 8 || b.y < 8 || b.x > mapW - 8 || b.y > mapH - 8) b.dead = true;
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (this.bullets[i]!.dead) this.bullets.splice(i, 1);
    }
  }
}

export const LIL_POSSESSED_FAMILIAR_STUBBED = false;
