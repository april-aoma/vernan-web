import { groundYFromMap } from "./SecretRoomMapBuild";
import { TILE_BREAKABLE, TILE_EMPTY, TILE_SOLID, type TileMap } from "./TileMap";

/**
 * Shared vertical secret-seam row math (Java VerticalSeamGeometry / LADDER-VERT-SEAL-1).
 */
export function mouthRow(map: TileMap, ladderTx: number): number {
  return resolvedLadderMouthRowAt(map, ladderTx);
}

/** Opened south mouth runway: max(L±1) when flanks differ. */
export function operationalSouthMouthRow(map: TileMap, ladderTx: number): number {
  return resolvedLadderRunwayRowAt(map, ladderTx, true);
}

/** North room's south-face shell B (strikable from shaft lane). */
export function northRoomSouthSealY(map: TileMap, ladderTx: number): number {
  const mouth = mouthRow(map, ladderTx);
  return Math.max(1, mouth - 1);
}

/** South room's north-face shell B (row 1; air at row 0). */
export function southRoomNorthSealY(): number {
  return 1;
}

export function southSealedBandStartY(mouth: number): number {
  return Math.max(1, mouth - 1);
}

/** Clear (L±1, sealY) so Vernan can strike the shell B from the side. */
export function carveStrikeLaneBesideSeal(map: TileMap, ladderTx: number, sealY: number): void {
  const w = map.getWidth();
  const h = map.getHeight();
  if (sealY < 1 || sealY >= h - 1) return;
  for (const dx of [-1, 1]) {
    const x = ladderTx + dx;
    if (x < 1 || x >= w - 1) continue;
    const t = map.tileAt(x, sealY);
    if (t === TILE_SOLID || t === TILE_BREAKABLE) {
      map.setTile(x, sealY, TILE_EMPTY);
    }
  }
}

/** Shallow deck when L±1 differ (min) — B at mouth−1. */
export function resolvedLadderMouthRowAt(map: TileMap, ladderTx: number): number {
  return resolvedLadderRunwayRowFromFlanks(map, ladderTx, false);
}

/** Deep runway when ladderSouth (max flanks). */
export function resolvedLadderRunwayRowAt(
  map: TileMap,
  ladderTx: number,
  ladderSouth: boolean,
): number {
  return resolvedLadderRunwayRowFromFlanks(map, ladderTx, ladderSouth);
}

function resolvedLadderRunwayRowFromFlanks(
  map: TileMap,
  ladderTx: number,
  useDeepDeckWhenUnequal: boolean,
): number {
  if (ladderTx < 1) return 1;
  const w = map.getWidth();
  const l = Math.max(1, Math.min(ladderTx, w - 2));
  const groundY = groundYFromMap(map);
  const left = flankPlayFloorRow(groundY, l - 1);
  const right = flankPlayFloorRow(groundY, l + 1);
  if (left !== right) {
    return useDeepDeckWhenUnequal ? Math.max(left, right) : Math.min(left, right);
  }
  return left;
}

function flankPlayFloorRow(groundY: number[], flankTx: number): number {
  if (groundY.length === 0) return 1;
  const col = Math.max(1, Math.min(flankTx, groundY.length - 2));
  return groundY[col]!;
}
