import {
  type Nephilim,
  type NephilimDeathChunkSpawn,
} from "../entity/Nephilim";
import { BrickChunk, type BrickChunkSprite } from "../fx/BrickChunk";
import type { SpriteStrip } from "../render/SpriteDraw";

const NEPHILIM_DEBRIS_LIFETIME_SEC = 8;
const NEPHILIM_DEBRIS_BLINK_START_SEC = 7;

function spawnDeathChunk(
  req: NephilimDeathChunkSpawn,
  strip: SpriteStrip | null,
  frameW: number,
  frameH: number,
): BrickChunk {
  let sprite: BrickChunkSprite | null = null;
  if (strip) {
    const fi = Math.max(0, Math.min(strip.frameCount - 1, req.frameIndex));
    sprite = {
      image: strip.image,
      sx: fi * frameW,
      sy: 0,
      sw: frameW,
      sh: frameH,
    };
  }
  const chunk = BrickChunk.createPivotAnchored(
    req.pivotWorldX,
    req.pivotWorldY,
    req.vx,
    req.vy,
    sprite,
    req.angleRad,
    req.omega,
    frameW,
    req.pivotX,
    req.pivotY,
    req.mirror,
    req.hullLocal,
  );
  chunk.setLifetime(NEPHILIM_DEBRIS_LIFETIME_SEC, NEPHILIM_DEBRIS_BLINK_START_SEC);
  return chunk;
}

/** Spawn defeated Nephilim limbs as pivot-anchored BrickChunks. */
export function processNephilimDeathChunks(
  boss: Nephilim,
  nephilimStrip: SpriteStrip | null,
  out: BrickChunk[],
): void {
  const spawns = boss.drainDeathChunkSpawns();
  if (spawns.length === 0) return;
  const frameW = nephilimStrip?.frameW ?? 16;
  const frameH = nephilimStrip?.frameH ?? 16;
  for (const req of spawns) {
    out.push(spawnDeathChunk(req, nephilimStrip, frameW, frameH));
  }
}
