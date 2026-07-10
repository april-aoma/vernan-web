import type { Aabb } from "../combat/CombatMath";
import type { Player } from "../entity/Player";
import {
  spawnBreakableBrickChunks,
  type BrickChunk,
} from "../fx/BrickChunk";
import { HUD_HEIGHT, TILE_SIZE } from "../specs";
import {
  playableScrollXIfFaceOpened,
  resolveCameraScrollBounds,
  type PlayableScrollX,
} from "../camera/playableScroll";
import { WorldCamera } from "../camera/WorldCamera";
import { terrainBrickRng, terrainLootKind } from "./BreakableLootRoll";
import type { DungeonLayout } from "./DungeonLayout";
import type { GeneratedRoom } from "./RoomGenerator";
import type { SecretSeam } from "./SecretEntrancePlacer";
import { SeamKind } from "./SecretEntrancePlacer";
import { SecretSeamOpenAnim } from "./SecretSeamOpenAnim";
import { TILE_EMPTY, type TileMap } from "./TileMap";
import { WorldPickup } from "./WorldPickup";

/** Java CombatJuice.BLOCK_BREAK_HITLAG_FRAMES. */
const BLOCK_BREAK_HITLAG_FRAMES = 3;

export type BreakableStrikeContext = {
  player: Player;
  map: TileMap;
  roomId: number;
  rooms: GeneratedRoom[];
  seams: SecretSeam[] | null | undefined;
  layout: DungeonLayout;
  runSeed: bigint;
  camera: WorldCamera;
  brickChunks: BrickChunk[];
  worldPickups: WorldPickup[];
  /** Optional 16×16 tile snapshot for sprite-subimage chunks. */
  snapshotTile?: (tx: number, ty: number) => HTMLCanvasElement | null;
  /** Current active seam anim, or null. Mutated by this module. */
  activeSeamOpenAnim: { current: SecretSeamOpenAnim | null };
  /** Playable scroll while H SEAM-ANIM pans (Java seamAnimPlayableScrollOverride). */
  seamAnimPlayableScrollOverride: { current: PlayableScrollX | null };
};

/**
 * Sword vs TILE_BREAKABLE (Java trySwordStrikeTiles / destroyBreakableTile).
 * Call from mount after player.applyAttackHits — does not edit Player.ts.
 * Does not latch attackHitLanded (mount latches after enemies + blocks so both connect same frame).
 * @returns hitlag frames to apply (BLOCK_BREAK_HITLAG_FRAMES), or 0 if none / already latched.
 */
export function applySwordBreakables(ctx: BreakableStrikeContext): number {
  const { player } = ctx;
  const sword = player.attackHitbox();
  if (!sword || player.attackHitLanded) return 0;
  if (ctx.activeSeamOpenAnim.current) return 0;
  const any = strikeBreakablesInAabb(sword, ctx);
  if (!any) return 0;
  player.hitlagFrames = Math.max(player.hitlagFrames, BLOCK_BREAK_HITLAG_FRAMES);
  return BLOCK_BREAK_HITLAG_FRAMES;
}

function strikeBreakablesInAabb(hit: Aabb, ctx: BreakableStrikeContext): boolean {
  const x0 = Math.floor(hit.x / TILE_SIZE);
  const x1 = Math.floor((hit.x + hit.w - 1e-5) / TILE_SIZE);
  const y0 = Math.floor(hit.y / TILE_SIZE);
  const y1 = Math.floor((hit.y + hit.h - 1e-5) / TILE_SIZE);
  let any = false;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!ctx.map.isBreakableTile(tx, ty)) continue;
      destroyBreakableTile(tx, ty, ctx);
      any = true;
    }
  }
  return any;
}

function destroyBreakableTile(tx: number, ty: number, ctx: BreakableStrikeContext): void {
  const bx = tx * TILE_SIZE;
  const by = ty * TILE_SIZE;
  const brickRnd = terrainBrickRng(ctx.runSeed, ctx.roomId, tx, ty);
  const tileSnap = ctx.snapshotTile?.(tx, ty) ?? null;

  if (ctx.seams != null && tryBeginSeamOpenAnim(tx, ty, bx, by, brickRnd, tileSnap, ctx)) {
    return;
  }

  ctx.map.setTile(tx, ty, TILE_EMPTY);
  spawnBreakableBrickChunks(bx, by, brickRnd, ctx.brickChunks, 1, "#8a5a3a", tileSnap);
  const loot = terrainLootKind(ctx.runSeed, ctx.roomId, tx, ty);
  if (loot != null) {
    ctx.worldPickups.push(WorldPickup.createFromBreakable(loot, bx + 8, by + 8, brickRnd));
  }
  if (ctx.seams != null) {
    for (const seam of ctx.seams) {
      if (!seam.isDone()) seam.onTileOpened(ctx.rooms, ctx.roomId, tx, ty, ctx.layout);
    }
  }
}

function tryBeginSeamOpenAnim(
  tx: number,
  ty: number,
  bx: number,
  by: number,
  rnd: () => number,
  tileSnap: HTMLCanvasElement | null,
  ctx: BreakableStrikeContext,
): boolean {
  if (ctx.activeSeamOpenAnim.current || ctx.seams == null) return false;
  const seam = SecretSeamOpenAnim.findForBreakable(
    ctx.seams,
    ctx.roomId,
    tx,
    ty,
    ctx.map.getHeight(),
  );
  if (seam == null || seam.isDone()) return false;

  const room = ctx.rooms[ctx.roomId]!;
  if (seam.kind === SeamKind.HORIZONTAL_DOOR) {
    ctx.seamAnimPlayableScrollOverride.current = playableScrollXIfFaceOpened(
      ctx.seams,
      seam,
      ctx.roomId,
      room,
      ctx.map.getWidth() * TILE_SIZE,
      ctx.layout,
    );
  } else {
    ctx.seamAnimPlayableScrollOverride.current = null;
  }

  const bounds = resolveCameraScrollBounds(
    ctx.map,
    ctx.layout,
    ctx.roomId,
    room,
    ctx.seams,
    ctx.seamAnimPlayableScrollOverride.current,
  );
  const anchorX = ctx.camera.centerX;
  const targetX = horizontalOpenPanTargetX(bounds, seam, ctx.roomId);
  const cameraBottomWorldY = ctx.camera.centerY + bounds.halfViewH;

  const anim = SecretSeamOpenAnim.begin(
    seam,
    ctx.seams,
    ctx.layout,
    ctx.rooms,
    ctx.roomId,
    tx,
    ty,
    anchorX,
    targetX,
    cameraBottomWorldY,
    HUD_HEIGHT,
  );
  anim.setStepSpawner((s) => {
    const cx = s.tx * TILE_SIZE;
    const cy = s.ty * TILE_SIZE;
    const stepRnd = terrainBrickRng(ctx.runSeed, ctx.roomId, s.tx, s.ty);
    const stepSnap = ctx.snapshotTile?.(s.tx, s.ty) ?? null;
    spawnBreakableBrickChunks(cx, cy, stepRnd, ctx.brickChunks, 1, "#8a5a3a", stepSnap);
  });
  spawnBreakableBrickChunks(bx, by, rnd, ctx.brickChunks, 1, "#8a5a3a", tileSnap);
  anim.applyStrikeStepNow(ctx.rooms, tx, ty);
  ctx.activeSeamOpenAnim.current = anim;
  return true;
}

function horizontalOpenPanTargetX(
  b: { halfViewW: number; minAnchorX: number; maxAnchorX: number },
  seam: SecretSeam,
  roomId: number,
): number {
  if (seam.kind !== SeamKind.HORIZONTAL_DOOR) return b.halfViewW;
  if (roomId === seam.roomWestId()) return b.maxAnchorX;
  if (roomId === seam.roomEastId()) return b.minAnchorX;
  return b.halfViewW;
}

/** Tick active seam anim + apply camera pan. Returns true while anim is active (freeze gameplay). */
export function tickSeamOpenAnim(
  animRef: { current: SecretSeamOpenAnim | null },
  playableOverride: { current: PlayableScrollX | null },
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
  roomId: number,
  seams: SecretSeam[] | null | undefined,
  camera: WorldCamera,
  map: TileMap,
): boolean {
  const anim = animRef.current;
  if (!anim) return false;
  const done = anim.tick(layout, rooms, true, true);
  if (anim.hasCameraPan()) {
    const room = rooms[roomId]!;
    const bounds = resolveCameraScrollBounds(
      map,
      layout,
      roomId,
      room,
      seams,
      playableOverride.current,
    );
    const ax = anim.cameraXForStep(0);
    const ay = camera.centerY;
    camera.reset(
      clamp(ax, bounds.minAnchorX, bounds.maxAnchorX),
      clamp(ay, bounds.minAnchorY, bounds.maxAnchorY),
    );
  }
  if (done) {
    animRef.current = null;
    playableOverride.current = null;
  }
  return animRef.current != null;
}

/** Flush seam anim on room exit. */
export function finishSeamOpenAnimInstant(
  animRef: { current: SecretSeamOpenAnim | null },
  playableOverride: { current: PlayableScrollX | null },
  layout: DungeonLayout,
  rooms: GeneratedRoom[],
): void {
  const anim = animRef.current;
  if (!anim) {
    playableOverride.current = null;
    return;
  }
  anim.finishInstant(layout, rooms);
  animRef.current = null;
  playableOverride.current = null;
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return (lo + hi) * 0.5;
  return Math.max(lo, Math.min(hi, v));
}
