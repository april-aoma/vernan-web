/**
 * Thin softlock audit for procedural cliff breakables (Java ProceduralBreakableNav subset).
 * Simulates all listed breakables destroyed and checks exits remain reachable.
 */

export type ExitSpec = {
  doorWest: boolean;
  doorEast: boolean;
  leftDoorX: number;
  rightDoorX: number;
  leftDoorTopY: number;
  rightDoorTopY: number;
  ladderTx: number;
  ladderFloorRow: number;
};

export const MAX_VERTICAL_REACH_TILES = 3;

/** @returns false if breaking all listed breakables would softlock. */
export function isNavigableAfterBreaking(
  grid: string[][],
  w: number,
  h: number,
  groundY: number[],
  exits: ExitSpec,
  proceduralBreakables: Array<{ tx: number; ty: number }>,
  maxReach = MAX_VERTICAL_REACH_TILES,
): boolean {
  if (proceduralBreakables.length === 0) return true;
  const mask = toBreakableMask(w, h, proceduralBreakables);
  return isNavigableAfterBreakingMask(grid, w, h, groundY, exits, mask, maxReach);
}

/**
 * Post-place audit: restore solids where procedural breakables fail the softlock check.
 * Mutates grid (and optional map setter) in place.
 */
export function auditAndStripIllegalBreakables(
  grid: string[][],
  w: number,
  h: number,
  groundY: number[],
  exits: ExitSpec,
  proceduralBreakables: Array<{ tx: number; ty: number }>,
  maxReach: number,
  restoreSolid: (tx: number, ty: number) => void,
): Array<{ tx: number; ty: number }> {
  if (proceduralBreakables.length === 0) return proceduralBreakables;
  if (isNavigableAfterBreaking(grid, w, h, groundY, exits, proceduralBreakables, maxReach)) {
    return proceduralBreakables;
  }
  for (const c of proceduralBreakables) {
    if (c.tx < 0 || c.ty < 0 || c.tx >= w || c.ty >= h) continue;
    grid[c.ty]![c.tx] = "#";
    restoreSolid(c.tx, c.ty);
  }
  return [];
}

function toBreakableMask(
  w: number,
  h: number,
  proceduralBreakables: Array<{ tx: number; ty: number }>,
): boolean[][] {
  const breakable: boolean[][] = Array.from({ length: h }, () => new Array(w).fill(false));
  for (const c of proceduralBreakables) {
    if (c.tx >= 0 && c.tx < w && c.ty >= 0 && c.ty < h) {
      breakable[c.ty]![c.tx] = true;
    }
  }
  return breakable;
}

function isNavigableAfterBreakingMask(
  grid: string[][],
  w: number,
  h: number,
  groundY: number[],
  exits: ExitSpec,
  proceduralMask: boolean[][],
  maxReach: number,
): boolean {
  const exitStandpoints = collectExitStandpoints(grid, w, h, groundY, exits);
  if (exitStandpoints.length === 0) return true;
  const reachable = bfsReachableStandpoints(
    grid,
    w,
    h,
    proceduralMask,
    exitStandpoints,
    maxReach,
  );
  if (reachable.size === 0) return false;
  for (const start of requiredStandpoints(grid, w, h, groundY, exits, proceduralMask)) {
    if (!reachable.has(start)) return false;
  }
  return true;
}

function requiredStandpoints(
  grid: string[][],
  w: number,
  h: number,
  groundY: number[],
  exits: ExitSpec,
  proceduralMask: boolean[][],
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const entryX = Math.min(2, w - 3);
  const entryY = groundY[entryX]! - 1;
  if (entryY >= 1 && isStandable(grid, w, h, proceduralMask, entryX, entryY)) {
    addPacked(seen, out, entryX, entryY);
  }
  if (exits.doorWest && exits.leftDoorX >= 0 && exits.leftDoorTopY >= 0) {
    addStandableNear(
      grid,
      w,
      h,
      proceduralMask,
      seen,
      out,
      exits.leftDoorX + 1,
      exits.leftDoorTopY + 2,
    );
  }
  if (exits.doorEast && exits.rightDoorX >= 0 && exits.rightDoorTopY >= 0) {
    addStandableNear(
      grid,
      w,
      h,
      proceduralMask,
      seen,
      out,
      exits.rightDoorX - 1,
      exits.rightDoorTopY + 2,
    );
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!proceduralMask[y]![x]) continue;
      const lowX = lowSideColumnForFace(x, y, grid, w, h);
      if (lowX < 1) continue;
      const lowY = groundY[lowX]! - 1;
      if (lowY >= 1 && isStandable(grid, w, h, proceduralMask, lowX, lowY)) {
        addPacked(seen, out, lowX, lowY);
      }
      addPlayFloorRegionBesideCliff(grid, w, h, groundY, exits, proceduralMask, seen, out, x, y);
    }
  }
  return out;
}

function addPlayFloorRegionBesideCliff(
  grid: string[][],
  w: number,
  h: number,
  groundY: number[],
  exits: ExitSpec,
  proceduralMask: boolean[][],
  seen: Set<number>,
  out: number[],
  faceX: number,
  faceY: number,
): void {
  if (isAirBesideFace(grid, faceX, faceY, -1)) {
    const westEnd = exits.doorWest && exits.leftDoorX >= 0 ? exits.leftDoorX + 1 : 1;
    for (let x = westEnd; x < faceX; x++) {
      addPlayFloorStandpoint(grid, w, h, groundY, proceduralMask, seen, out, x);
    }
  }
  if (isAirBesideFace(grid, faceX, faceY, 1)) {
    const eastStart = faceX + 1;
    const eastEnd = exits.doorEast && exits.rightDoorX >= 0 ? exits.rightDoorX : w - 2;
    for (let x = eastStart; x < eastEnd; x++) {
      addPlayFloorStandpoint(grid, w, h, groundY, proceduralMask, seen, out, x);
    }
  }
}

function isAirBesideFace(grid: string[][], faceX: number, faceY: number, dx: number): boolean {
  const nx = faceX + dx;
  if (nx < 1 || nx >= grid[0]!.length - 1 || faceY < 1 || faceY >= grid.length - 1) return false;
  return grid[faceY]![nx] === ".";
}

function addPlayFloorStandpoint(
  grid: string[][],
  w: number,
  h: number,
  groundY: number[],
  proceduralMask: boolean[][],
  seen: Set<number>,
  out: number[],
  x: number,
): void {
  if (x < 1 || x >= w - 1) return;
  const y = groundY[x]! - 1;
  if (y >= 1 && isStandable(grid, w, h, proceduralMask, x, y)) {
    addPacked(seen, out, x, y);
  }
}

function lowSideColumnForFace(
  faceX: number,
  faceY: number,
  grid: string[][],
  w: number,
  h: number,
): number {
  if (faceX >= 2 && faceY >= 1 && faceY < h - 1 && grid[faceY]![faceX] !== "#") {
    if (faceX - 1 >= 1 && grid[faceY]![faceX - 1] === ".") return faceX - 1;
  }
  if (faceX < w - 2 && faceY >= 1 && grid[faceY]![faceX] !== "#") {
    if (grid[faceY]![faceX + 1] === ".") return faceX + 1;
  }
  return -1;
}

function collectExitStandpoints(
  grid: string[][],
  w: number,
  h: number,
  groundY: number[],
  exits: ExitSpec,
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  if (exits.doorWest && exits.leftDoorX >= 0 && exits.leftDoorTopY >= 0) {
    addStandableNear(grid, w, h, null, seen, out, exits.leftDoorX + 1, exits.leftDoorTopY + 2);
    addStandableNear(grid, w, h, null, seen, out, exits.leftDoorX, exits.leftDoorTopY + 2);
  }
  if (exits.doorEast && exits.rightDoorX >= 0 && exits.rightDoorTopY >= 0) {
    addStandableNear(grid, w, h, null, seen, out, exits.rightDoorX - 1, exits.rightDoorTopY + 2);
    addStandableNear(grid, w, h, null, seen, out, exits.rightDoorX, exits.rightDoorTopY + 2);
  }
  if (exits.ladderTx >= 1 && exits.ladderTx < w - 1) {
    const foot = exits.ladderFloorRow >= 0 ? exits.ladderFloorRow : groundY[exits.ladderTx]!;
    addStandableNear(grid, w, h, null, seen, out, exits.ladderTx, foot - 1);
    addStandableNear(grid, w, h, null, seen, out, exits.ladderTx, foot);
  }
  return out;
}

function addStandableNear(
  grid: string[][],
  w: number,
  h: number,
  proceduralBreakable: boolean[][] | null,
  seen: Set<number>,
  out: number[],
  x: number,
  y: number,
): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) continue;
      if (isStandable(grid, w, h, proceduralBreakable, nx, ny)) {
        addPacked(seen, out, nx, ny);
      }
    }
  }
}

function addPacked(seen: Set<number>, out: number[], x: number, y: number): void {
  const p = pack(x, y);
  if (!seen.has(p)) {
    seen.add(p);
    out.push(p);
  }
}

function bfsReachableStandpoints(
  grid: string[][],
  w: number,
  h: number,
  proceduralBreakable: boolean[][],
  seeds: number[],
  maxReach: number,
): Set<number> {
  const seen = new Set<number>();
  const q: number[] = [];
  for (const s of seeds) {
    if (isStandable(grid, w, h, proceduralBreakable, unpackX(s), unpackY(s))) {
      q.push(s);
      seen.add(s);
    }
  }
  while (q.length > 0) {
    const cur = q.shift()!;
    const x = unpackX(cur);
    const y = unpackY(cur);
    tryWalk(grid, w, h, proceduralBreakable, seen, q, x - 1, y);
    tryWalk(grid, w, h, proceduralBreakable, seen, q, x + 1, y);
    for (let jump = 1; jump <= maxReach; jump++) {
      tryJump(grid, w, h, proceduralBreakable, seen, q, x, y, -jump);
      tryJump(grid, w, h, proceduralBreakable, seen, q, x, y, jump);
    }
    tryFall(grid, w, h, proceduralBreakable, seen, q, x, y);
  }
  return seen;
}

function tryWalk(
  grid: string[][],
  w: number,
  h: number,
  proceduralBreakable: boolean[][],
  seen: Set<number>,
  q: number[],
  x: number,
  y: number,
): void {
  if (!isStandable(grid, w, h, proceduralBreakable, x, y)) return;
  const p = pack(x, y);
  if (!seen.has(p)) {
    seen.add(p);
    q.push(p);
  }
}

function tryJump(
  grid: string[][],
  w: number,
  h: number,
  proceduralBreakable: boolean[][],
  seen: Set<number>,
  q: number[],
  x: number,
  y: number,
  dy: number,
): void {
  const ty = y + dy;
  if (ty < 1 || ty >= h - 1) return;
  const step = dy < 0 ? -1 : 1;
  for (let cy = y + step; cy !== ty + step; cy += step) {
    if (!isBodyPassable(grid, w, h, proceduralBreakable, x, cy)) return;
  }
  tryWalk(grid, w, h, proceduralBreakable, seen, q, x, ty);
}

function tryFall(
  grid: string[][],
  w: number,
  h: number,
  proceduralBreakable: boolean[][],
  seen: Set<number>,
  q: number[],
  x: number,
  y: number,
): void {
  for (let ty = y + 1; ty < h - 1; ty++) {
    if (isStandable(grid, w, h, proceduralBreakable, x, ty)) {
      const p = pack(x, ty);
      if (!seen.has(p)) {
        seen.add(p);
        q.push(p);
      }
      return;
    }
    if (!isBodyPassable(grid, w, h, proceduralBreakable, x, ty)) return;
  }
}

function isStandable(
  grid: string[][],
  w: number,
  h: number,
  proceduralBreakable: boolean[][] | null,
  x: number,
  y: number,
): boolean {
  if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) return false;
  if (!isBodyPassable(grid, w, h, proceduralBreakable, x, y)) return false;
  return isFloorSupport(grid, w, h, proceduralBreakable, x, y + 1);
}

function isFloorSupport(
  grid: string[][],
  w: number,
  h: number,
  proceduralBreakable: boolean[][] | null,
  x: number,
  y: number,
): boolean {
  if (x < 0 || x >= w || y < 0 || y >= h) return false;
  const c = effective(grid, proceduralBreakable, x, y);
  return c === "#" || c === "-" || c === "H";
}

function isBodyPassable(
  grid: string[][],
  w: number,
  h: number,
  proceduralBreakable: boolean[][] | null,
  x: number,
  y: number,
): boolean {
  if (x < 0 || x >= w || y < 0 || y >= h) return false;
  return effective(grid, proceduralBreakable, x, y) !== "#";
}

function effective(
  grid: string[][],
  proceduralBreakable: boolean[][] | null,
  x: number,
  y: number,
): string {
  if (proceduralBreakable && proceduralBreakable[y]![x]) return ".";
  return grid[y]![x]!;
}

function pack(x: number, y: number): number {
  return (x << 16) | (y & 0xffff);
}

function unpackX(p: number): number {
  return (p >> 16) & 0xffff;
}

function unpackY(p: number): number {
  return p & 0xffff;
}
