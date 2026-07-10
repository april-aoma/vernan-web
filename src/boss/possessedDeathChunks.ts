import {
  POSSESSED_DEBRIS_BLINK_START_SEC,
  POSSESSED_DEBRIS_LIFETIME_SEC,
  type Possessed,
  type PossessedDeathChunkSpawn,
} from "../entity/Possessed";
import { BrickChunk, type BrickChunkSprite } from "../fx/BrickChunk";
import type { SpriteStrip } from "../render/SpriteDraw";

function spawnDeathChunk(
  req: PossessedDeathChunkSpawn,
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
  chunk.setLifetime(POSSESSED_DEBRIS_LIFETIME_SEC, POSSESSED_DEBRIS_BLINK_START_SEC);
  return chunk;
}

/** Spawn defeated Possessed limbs as pivot-anchored BrickChunks (Java processPossessedDeathChunks). */
export function processPossessedDeathChunks(
  boss: Possessed,
  possessedStrip: SpriteStrip | null,
  shinyStrip: SpriteStrip | null,
  out: BrickChunk[],
): void {
  const spawns = boss.drainDeathChunkSpawns();
  if (spawns.length === 0) return;
  const strip = boss.isShiny() && shinyStrip ? shinyStrip : possessedStrip;
  const frameW = strip?.frameW ?? 16;
  const frameH = strip?.frameH ?? 16;
  for (const req of spawns) {
    out.push(spawnDeathChunk(req, strip, frameW, frameH));
  }
}
