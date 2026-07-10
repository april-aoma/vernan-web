import {
  BRICKCHUNK_RESTITUTION_FLOOR,
  BRICKCHUNK_RESTITUTION_WALL,
  BRICKCHUNK_SPAWN_OMEGA_RAD_PER_SEC,
  GRAVITY,
} from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";

/** Optional 8×8 sprite quarter from the destroyed tile (Java BrickChunk subimage). */
export type BrickChunkSprite = {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/** One 8×8 debris piece from a destroyed breakable (thin port of Java BrickChunk). */
export class BrickChunk {
  static readonly SIZE = 8;

  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  omega: number;
  /** Optional fill color when no sprite (brown brick). */
  color: string;
  sprite: BrickChunkSprite | null;
  private onGround = false;
  /** Settled long enough to cull (keeps room tidy). */
  ageSec = 0;
  settledSec = 0;

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    angle = 0,
    omega = 0,
    color = "#8a5a3a",
    sprite: BrickChunkSprite | null = null,
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.angle = angle;
    this.omega = omega;
    this.color = color;
    this.sprite = sprite;
  }

  get done(): boolean {
    return this.settledSec > 4;
  }

  update(dt: number, map: TileMap): void {
    this.ageSec += dt;
    if (this.onGround && Math.abs(this.vx) < 2 && Math.abs(this.vy) < 2 && Math.abs(this.omega) < 0.3) {
      this.settledSec += dt;
      this.vx = 0;
      this.vy = 0;
      this.omega *= 0.5;
      return;
    }
    this.settledSec = 0;
    this.vy += GRAVITY * dt;
    this.vx *= Math.exp(-0.65 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.omega * dt;
    this.resolveMap(map, dt);
  }

  private resolveMap(map: TileMap, dt: number): void {
    const s = BrickChunk.SIZE;
    const cx = this.x + s * 0.5;
    const cy = this.y + s * 0.5;
    const tx = Math.floor(cx / TILE_SIZE);
    const ty = Math.floor(cy / TILE_SIZE);
    this.onGround = false;

    // Floor: bottom edge into solid
    const feetTy = Math.floor((this.y + s) / TILE_SIZE);
    if (map.isSolidTile(tx, feetTy) || map.isPlatformTile(tx, feetTy)) {
      const floorY = feetTy * TILE_SIZE;
      if (this.y + s > floorY && this.vy >= 0) {
        this.y = floorY - s;
        this.vy = -this.vy * BRICKCHUNK_RESTITUTION_FLOOR;
        if (Math.abs(this.vy) < 18) this.vy = 0;
        this.vx *= Math.exp(-12 * dt);
        this.omega *= Math.exp(-15 * dt);
        this.onGround = true;
      }
    }

    // Ceiling
    const headTy = Math.floor(this.y / TILE_SIZE);
    if (map.isSolidTile(tx, headTy) && this.vy < 0) {
      this.y = (headTy + 1) * TILE_SIZE;
      this.vy = -this.vy * 0.16;
    }

    // Walls
    const leftTx = Math.floor(this.x / TILE_SIZE);
    const rightTx = Math.floor((this.x + s - 0.01) / TILE_SIZE);
    if (this.vx < 0 && map.isSolidTile(leftTx, ty)) {
      this.x = (leftTx + 1) * TILE_SIZE;
      this.vx = -this.vx * BRICKCHUNK_RESTITUTION_WALL;
      this.omega *= 0.7;
    } else if (this.vx > 0 && map.isSolidTile(rightTx, ty)) {
      this.x = rightTx * TILE_SIZE - s;
      this.vx = -this.vx * BRICKCHUNK_RESTITUTION_WALL;
      this.omega *= 0.7;
    }
  }
}

/**
 * Spawn four 8×8 shards for a 16×16 breakable cell (Java applyBreakableBrickChunksOnly).
 * When {@code tileSnap} is set, each quarter uses that 16×16 canvas as a subimage.
 */
export function spawnBreakableBrickChunks(
  bx: number,
  by: number,
  rnd: () => number,
  out: BrickChunk[],
  velocityScale = 1,
  color = "#8a5a3a",
  tileSnap: HTMLCanvasElement | OffscreenCanvas | null = null,
): void {
  for (let i = 0; i < 4; i++) {
    const qx = (i % 2) * 8;
    const qy = Math.floor(i / 2) * 8;
    const omega0 =
      (rnd() - 0.5) * 2 * BRICKCHUNK_SPAWN_OMEGA_RAD_PER_SEC * velocityScale;
    const angle0 = (rnd() - 0.5) * 0.4 * velocityScale;
    const sprite: BrickChunkSprite | null = tileSnap
      ? { image: tileSnap, sx: qx, sy: qy, sw: 8, sh: 8 }
      : null;
    out.push(
      new BrickChunk(
        bx + qx,
        by + qy,
        (rnd() - 0.5) * 140 * velocityScale,
        (-rnd() * 95 - 18) * velocityScale,
        angle0,
        omega0,
        color,
        sprite,
      ),
    );
  }
}

/** Deterministic-ish RNG from cell coords (Java Random(seed ^ …)). */
export function brickChunkRng(runSeed: bigint, roomId: number, tx: number, ty: number): () => number {
  let state =
    Number(runSeed & 0xffffffffn) ^
    (tx * 0x9e3779b1) ^
    (ty * 0x85ebca77) ^
    roomId * 37;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 0x100000000;
  };
}
