import { MAX_VERTICAL_REACH_TILES } from "./ProceduralBreakableNav";
import type { GeneratedRoom } from "./RoomGenerator";
import { groundYFromMap, seamPlayFloorRow } from "./SecretRoomMapBuild";
import type { TileMap } from "./TileMap";

/**
 * Navigation audit for SECRET rooms with west+east horizontal exits (SEC-DUAL-1).
 * (Java SecretDualSeamNav)
 */
export function hasDualHorizontalSeams(g: GeneratedRoom | null | undefined): boolean {
  if (!g) return false;
  return (
    g.leftDoorTileX >= 0 &&
    g.leftDoorTopTileY >= 0 &&
    g.rightDoorTileX >= 0 &&
    g.rightDoorTopTileY >= 0
  );
}

/** Both horizontal seam play floors reachable along interior columns. */
export function runwayFloorsConnected(
  map: TileMap,
  g: GeneratedRoom,
  maxReach = MAX_VERTICAL_REACH_TILES,
): boolean {
  if (!hasDualHorizontalSeams(g)) return true;
  const h = map.getHeight();
  const groundY = groundYFromMap(map);
  const westFloor = seamPlayFloorRow(g.leftDoorTopTileY, h);
  const eastFloor = seamPlayFloorRow(g.rightDoorTopTileY, h);
  const westCol = g.leftDoorTileX + 1;
  const eastCol = g.rightDoorTileX - 1;
  return (
    columnsConnect(groundY, westCol, eastCol, westFloor, eastFloor, maxReach) &&
    columnsConnect(groundY, eastCol, westCol, eastFloor, westFloor, maxReach)
  );
}

function columnsConnect(
  groundY: number[],
  fromCol: number,
  toCol: number,
  fromFloor: number,
  toFloor: number,
  maxReach: number,
): boolean {
  if (fromCol < 0 || toCol < 0 || fromCol >= groundY.length || toCol >= groundY.length) {
    return false;
  }
  if (Math.abs(groundY[fromCol]! - fromFloor) > maxReach) return false;
  const lo = Math.min(fromCol, toCol);
  const hi = Math.max(fromCol, toCol);
  const seen = new Set<number>();
  const q: number[] = [fromCol];
  seen.add(fromCol);
  while (q.length > 0) {
    const x = q.shift()!;
    if (x === toCol && Math.abs(groundY[x]! - toFloor) <= maxReach) return true;
    for (let nx = x - 1; nx <= x + 1; nx++) {
      if (nx < lo || nx > hi || seen.has(nx)) continue;
      if (Math.abs(groundY[nx]! - groundY[x]!) > maxReach) continue;
      seen.add(nx);
      q.push(nx);
    }
  }
  return false;
}
