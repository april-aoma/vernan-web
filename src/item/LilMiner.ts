import {
  loadPossessedStyleRig,
  poseFromSequence,
  poseOffset,
  type PossessedRigData,
} from "../boss/PossessedRig";

export type LilMinerPartRender = {
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
};

const PART_K = 220;
const PART_C = 2 * Math.sqrt(PART_K);
const ANGLE_K = 200;
const ANGLE_C = 2 * Math.sqrt(ANGLE_K);
const FOLLOW_K = 95;
const FOLLOW_C = 2 * Math.sqrt(FOLLOW_K);
const MOVE_FACING_VEL = 2;
const IDLE_SEQ_FPS = 2;
const MINING_ANIM_SEC = 0.55;
const THROW_ANIM_SEC = 0.42;
export const LIL_MINER_ROOMS_PER_COIN = 7;
export const LIL_MINER_RIG_PATH = "sprites/lil miner friend.rig.json";

type AnimState = "idle" | "mining" | "throw";

/** Lil Miner familiar (Java LilMiner). */
export class LilMiner {
  x: number;
  y: number;
  private vx = 0;
  private vy = 0;
  private sims: PartSim[] = [];
  private simNames: string[] = [];
  private bodyIndex = 0;
  private bobTime = 0;
  private idleSeqTime = 0;
  private facingRight = false;
  private animState: AnimState = "idle";
  private oneShotTimer = 0;
  private roomsMined = 0;
  private coinThrowPending = false;
  private rig: PossessedRigData | null = null;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  async loadRig(assets: {
    loadJson: <T = unknown>(relPath: string) => Promise<T>;
  }): Promise<void> {
    this.rig = await loadPossessedStyleRig(assets, LIL_MINER_RIG_PATH);
    this.ensureSims();
  }

  snapTo(px: number, py: number): void {
    this.x = px;
    this.y = py;
    this.vx = 0;
    this.vy = 0;
    this.animState = "idle";
    this.oneShotTimer = 0;
    this.coinThrowPending = false;
    this.sims = [];
    this.simNames = [];
    this.ensureSims();
  }

  resetRoomClearProgress(): void {
    this.roomsMined = 0;
    this.animState = "idle";
    this.oneShotTimer = 0;
    this.coinThrowPending = false;
  }

  onRoomCleared(): void {
    this.roomsMined++;
    if (this.roomsMined >= LIL_MINER_ROOMS_PER_COIN) {
      this.roomsMined = 0;
      this.animState = "throw";
      this.oneShotTimer = THROW_ANIM_SEC;
      this.coinThrowPending = false;
    } else {
      this.animState = "mining";
      this.oneShotTimer = MINING_ANIM_SEC;
      this.coinThrowPending = false;
    }
  }

  drainCoinThrow(): boolean {
    if (!this.coinThrowPending) return false;
    this.coinThrowPending = false;
    return true;
  }

  coinThrowOrigin(): [number, number] {
    const body = this.sims[this.bodyIndex];
    if (body) return [body.cx, body.cy - 4];
    return [this.x, this.y - 4];
  }

  update(dt: number, followX: number, followY: number, playerCx: number): void {
    this.ensureSims();
    this.bobTime += dt;
    this.tickAnimation(dt);

    this.vx += ((followX - this.x) * FOLLOW_K - this.vx * FOLLOW_C) * dt;
    this.vy += ((followY - this.y) * FOLLOW_K - this.vy * FOLLOW_C) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (Math.abs(this.vx) > MOVE_FACING_VEL) this.facingRight = this.vx > 0;
    else if (Math.abs(playerCx - this.x) > 1e-6) this.facingRight = playerCx > this.x;

    this.integrateParts(dt);
  }

  partRenders(): LilMinerPartRender[] {
    const rig = this.rig;
    if (!rig) return [];
    const out: LilMinerPartRender[] = [];
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

  private tickAnimation(dt: number): void {
    if (this.animState === "idle") {
      this.idleSeqTime += dt;
      return;
    }
    const prev = this.oneShotTimer;
    this.oneShotTimer = Math.max(0, this.oneShotTimer - dt);
    if (
      this.animState === "throw" &&
      prev > THROW_ANIM_SEC * 0.45 &&
      this.oneShotTimer <= THROW_ANIM_SEC * 0.45
    ) {
      this.coinThrowPending = true;
    }
    if (this.oneShotTimer <= 0) {
      this.animState = "idle";
      this.idleSeqTime = 0;
    }
  }

  private activePoseName(): string {
    const rig = this.rig;
    if (!rig) return "idle";
    if (this.animState === "idle") {
      const seq = rig.sequences.idle ?? ["idle"];
      if (seq.length <= 1) return seq[0] ?? "idle";
      const cycleSec = seq.length / IDLE_SEQ_FPS;
      const progress = cycleSec > 1e-6 ? (this.idleSeqTime % cycleSec) / cycleSec : 0;
      return poseFromSequence(rig, "idle", progress);
    }
    const dur = this.animState === "mining" ? MINING_ANIM_SEC : THROW_ANIM_SEC;
    const progress = dur > 1e-6 ? 1 - Math.max(0, this.oneShotTimer) / dur : 1;
    return poseFromSequence(rig, this.animState, progress);
  }

  private ensureSims(): void {
    const rig = this.rig;
    if (!rig) return;
    if (this.sims.length === rig.parts.length) return;
    this.sims = [];
    this.simNames = [];
    const mirror = this.facingRight ? -1 : 1;
    for (let i = 0; i < rig.parts.length; i++) {
      const def = rig.parts[i]!;
      const pe = poseOffset(rig, "idle", def.name);
      this.sims.push({
        cx: this.x + mirror * pe.dx,
        cy: this.y + pe.dy,
        vx: 0,
        vy: 0,
        angleDeg: pe.angleDeg,
        angleVel: 0,
        bobPhase: i * 1.7,
      });
      this.simNames.push(def.name);
      if (def.name === "body") this.bodyIndex = i;
    }
  }

  private integrateParts(dt: number): void {
    const rig = this.rig;
    if (!rig) return;
    const poseName = this.activePoseName();
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
}
