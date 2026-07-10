import type { Aabb } from "../combat/CombatMath";
import type { Player } from "../entity/Player";
import type { Input } from "../input/Input";
import { TILE_SIZE } from "../specs";
import { KeyblockSealRuntime } from "./KeyblockSealRuntime";
import type { KeyblockSealSpec } from "./KeyblockSealSpec";
import type { TileMap } from "./TileMap";

/** Java Physics.STAGGER_FRAMES / KEYBLOCK_ANIM_TIMELINE_FRAME_STRIDE. */
export const KEYBLOCK_STAGGER_FRAMES = 3;
export const KEYBLOCK_ANIM_TIMELINE_FRAME_STRIDE = 8;
export const KEYBLOCK_ACTIVATION_MAX_SEPARATION_PX = 1.0;

export type KeyblockTickState = {
  runtimesByRoom: (KeyblockSealRuntime[] | null)[];
  freezeSeal: KeyblockSealRuntime | null;
  timelineTickCounter: number;
};

export function createKeyblockTickState(
  specsByRoom: (KeyblockSealSpec[] | null)[] | null | undefined,
  roomCount: number,
): KeyblockTickState {
  return {
    runtimesByRoom: rebuildKeyblockRuntimes(specsByRoom, roomCount),
    freezeSeal: null,
    timelineTickCounter: 0,
  };
}

export function rebuildKeyblockRuntimes(
  specsByRoom: (KeyblockSealSpec[] | null)[] | null | undefined,
  roomCount: number,
): (KeyblockSealRuntime[] | null)[] {
  const out: (KeyblockSealRuntime[] | null)[] = new Array(roomCount).fill(null);
  if (!specsByRoom) return out;
  for (let i = 0; i < roomCount && i < specsByRoom.length; i++) {
    const specs = specsByRoom[i];
    if (!specs?.length) continue;
    out[i] = specs.map((s) => new KeyblockSealRuntime(s));
  }
  return out;
}

/**
 * Tick seals in the current room. Returns true if gameplay should freeze
 * (primary unlock in progress).
 * (Java GamePanel.tickKeyblockSeals)
 */
export function tickKeyblockSeals(
  state: KeyblockTickState,
  roomId: number,
  map: TileMap,
  player: Player,
  input: Input | null,
): boolean {
  state.timelineTickCounter++;
  const stride = Math.max(1, KEYBLOCK_ANIM_TIMELINE_FRAME_STRIDE);
  const advanceTimeline = state.timelineTickCounter % stride === 0;
  if (roomId < 0) return state.freezeSeal != null;
  const seals = roomId < state.runtimesByRoom.length ? state.runtimesByRoom[roomId] : null;
  if (!seals) {
    return state.freezeSeal != null;
  }
  const stagger = Math.max(1, KEYBLOCK_STAGGER_FRAMES);
  const hull = player.hitboxPose().bounds();
  for (const seal of seals) {
    const slots = seal.spec.slots;
    const n = slots.length;
    const lastFrameEnd = (n - 1) * stagger + 6;
    if (seal.timeline < 0) {
      if (state.freezeSeal != null && state.freezeSeal !== seal) continue;
      if (player.stats.keys <= 0) continue;
      for (const s of slots) {
        if (!s.primary) continue;
        if (keyblockActivationProximity(hull, s.tx, s.ty)) {
          player.stats.keys--;
          seal.timeline = 0;
          state.freezeSeal = seal;
          input?.flushInputEdges();
          break;
        }
      }
    }
    if (seal.timeline < 0) continue;
    for (let i = 0; i < n; i++) {
      const start = i * stagger;
      if (seal.timeline >= start && !seal.slotTileCleared[i]) {
        const s = slots[i]!;
        map.setTile(s.tx, s.ty, s.restoreTileId);
        seal.slotTileCleared[i] = true;
      }
    }
    if (advanceTimeline && seal.timeline <= lastFrameEnd) {
      seal.timeline++;
    }
  }
  if (state.freezeSeal != null && state.freezeSeal.timeline >= 7) {
    state.freezeSeal = null;
  }
  return state.freezeSeal != null;
}

function keyblockActivationProximity(hull: Aabb, tileTx: number, tileTy: number): boolean {
  const tile: Aabb = {
    x: tileTx * TILE_SIZE,
    y: tileTy * TILE_SIZE,
    w: TILE_SIZE,
    h: TILE_SIZE,
  };
  if (aabbIntersects(hull, tile)) return true;
  const gx = axisSeparationX(hull, tile);
  const gy = axisSeparationY(hull, tile);
  return gx <= KEYBLOCK_ACTIVATION_MAX_SEPARATION_PX && gy <= KEYBLOCK_ACTIVATION_MAX_SEPARATION_PX;
}

function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function axisSeparationX(a: Aabb, b: Aabb): number {
  if (a.x + a.w <= b.x) return b.x - (a.x + a.w);
  if (b.x + b.w <= a.x) return a.x - (b.x + b.w);
  return 0;
}

function axisSeparationY(a: Aabb, b: Aabb): number {
  if (a.y + a.h <= b.y) return b.y - (a.y + a.h);
  if (b.y + b.h <= a.y) return a.y - (b.y + b.h);
  return 0;
}
