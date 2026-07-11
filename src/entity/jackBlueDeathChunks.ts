import type { JackBlue, JackBlueDeathChunkSpawn } from "./JackBlue";
import { BrickChunk, type BrickChunkSprite } from "../fx/BrickChunk";
import type { SpriteStrip } from "../render/SpriteDraw";

/** Spawn Jack Blue death shards as 8×8 BrickChunks (Java processJackBlueDeathChunks). */
export function processJackBlueDeathChunks(
  jb: JackBlue,
  strip: SpriteStrip | null,
  out: BrickChunk[],
): void {
  const spawns = jb.drainDeathChunkSpawns();
  if (spawns.length === 0) return;
  const fi = Math.max(0, Math.min(2, jb.getAnimFrame()));
  const frameW = strip?.frameW ?? 32;
  for (const req of spawns) {
    out.push(spawnDeathChunk(req, strip, fi, frameW));
  }
}

function spawnDeathChunk(
  req: JackBlueDeathChunkSpawn,
  strip: SpriteStrip | null,
  frameIndex: number,
  frameW: number,
): BrickChunk {
  let sprite: BrickChunkSprite | null = null;
  if (strip && req.subX + 8 <= frameW && req.subY + 8 <= strip.frameH) {
    sprite = {
      image: strip.image,
      sx: frameIndex * frameW + req.subX,
      sy: req.subY,
      sw: 8,
      sh: 8,
    };
  }
  return new BrickChunk(req.ox, req.oy, req.vx, req.vy, req.angle, req.omega, "#6490c8", sprite);
}

export type PendingJackDeathExplosion = { cx: number; cy: number; delaySec: number };

export function tickPendingJackDeathExplosions(
  pending: PendingJackDeathExplosion[],
  dt: number,
  onBurst: (cx: number, cy: number) => void,
): void {
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i]!;
    p.delaySec -= dt;
    if (p.delaySec > 0) continue;
    onBurst(p.cx, p.cy);
    pending.splice(i, 1);
  }
}
