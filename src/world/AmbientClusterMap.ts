import type { DecoStamp } from "../tileset/placeAmbientDeco";
import { JavaRandom } from "../util/JavaRandom";
import { TILE_SIZE } from "../specs";
import type { Aabb } from "../combat/CombatMath";
import { TILE_EMPTY, type TileMap } from "./TileMap";

const NEIGH8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const DECO_CLUSTER_SEED_SALT = 0xdec07een;

/**
 * Connected components of procedural ambient deco blobs (Java AmbientClusterMap).
 * Used by golden roach locomotion and spawn placement.
 */
export class AmbientClusterMap {
  private readonly width: number;
  private readonly height: number;
  /** -1 = not cluster; else component id. */
  private readonly clusterId: Int32Array;
  private readonly components: Array<Array<readonly [number, number]>>;

  private constructor(
    width: number,
    height: number,
    clusterId: Int32Array,
    components: Array<Array<readonly [number, number]>>,
  ) {
    this.width = width;
    this.height = height;
    this.clusterId = clusterId;
    this.components = components;
  }

  static buildFromDeco(map: TileMap, deco: readonly DecoStamp[] | undefined): AmbientClusterMap {
    const w = map.getWidth();
    const h = map.getHeight();
    const ambient = new Set<string>();
    for (const d of deco ?? []) {
      if (d.groundHugging) continue;
      if (d.tx < 0 || d.ty < 0 || d.tx >= w || d.ty >= h) continue;
      if (map.tileAt(d.tx, d.ty) !== TILE_EMPTY) continue;
      ambient.add(`${d.tx},${d.ty}`);
    }
    return AmbientClusterMap.fromAmbientCells(w, h, ambient);
  }

  /** Predict cluster cells before tileset deco is stamped (spawn budget at dungeon build). */
  static buildPredicted(
    map: TileMap,
    contentSeed: bigint,
    ladderColumnTx: number,
    clusterCountMin = 3,
    clusterCountMax = 6,
  ): AmbientClusterMap {
    const w = map.getWidth();
    const h = map.getHeight();
    const ambient = new Set<string>();
    const rng = new JavaRandom(contentSeed ^ DECO_CLUSTER_SEED_SALT);
    let cmin = clusterCountMin;
    let cmax = clusterCountMax;
    if (cmax < cmin) [cmin, cmax] = [cmax, cmin];
    const clusters = cmin + (cmax > cmin ? rng.nextInt(cmax - cmin + 1) : 0);
    const occupied = new Set<string>();

    for (let i = 0; i < clusters; i++) {
      const cx = 2 + rng.nextInt(Math.max(1, w - 4));
      const baseY = 2 + rng.nextInt(Math.max(1, h - 6));
      const cw = 3 + rng.nextInt(5);
      const ch = 3 + rng.nextInt(6);
      for (let dx = -cw; dx <= cw; dx++) {
        for (let dy = -ch; dy <= ch; dy++) {
          const tx = cx + dx;
          const ty = baseY + dy;
          if (tx <= 1 || tx >= w - 1) continue;
          if (ty <= 1 || ty >= h - 1) continue;
          if (ladderColumnTx >= 0 && tx === ladderColumnTx) continue;
          if (map.tileAt(tx, ty) !== TILE_EMPTY) continue;
          const nx = dx / cw;
          const ny = dy / ch;
          if (nx * nx + ny * ny > 1.0) continue;
          if (rng.nextInt(7) === 0) continue;
          const key = `${tx},${ty}`;
          if (occupied.has(key)) continue;
          occupied.add(key);
          ambient.add(key);
        }
      }
    }
    return AmbientClusterMap.fromAmbientCells(w, h, ambient);
  }

  private static fromAmbientCells(w: number, h: number, ambient: Set<string>): AmbientClusterMap {
    const ids = new Int32Array(w * h);
    ids.fill(-1);
    const components: Array<Array<readonly [number, number]>> = [];
    const pending = [...ambient];
    let nextId = 0;

    while (pending.length > 0) {
      const start = pending.pop()!;
      const [sx, sy] = start.split(",").map(Number) as [number, number];
      const idx = sy * w + sx;
      if (ids[idx]! >= 0) continue;

      const cells: Array<readonly [number, number]> = [];
      const stack: Array<readonly [number, number]> = [[sx, sy]];
      ids[idx] = nextId;

      while (stack.length > 0) {
        const [tx, ty] = stack.pop()!;
        cells.push([tx, ty]);
        for (const [ox, oy] of NEIGH8) {
          const nx = tx + ox;
          const ny = ty + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nkey = `${nx},${ny}`;
          if (!ambient.has(nkey)) continue;
          const nidx = ny * w + nx;
          if (ids[nidx]! >= 0) continue;
          ids[nidx] = nextId;
          stack.push([nx, ny]);
        }
      }
      if (cells.length > 0) {
        components.push(cells);
        nextId++;
      }
    }

    return new AmbientClusterMap(w, h, ids, components);
  }

  isEmpty(): boolean {
    return this.components.length === 0;
  }

  clusterCount(): number {
    return this.components.length;
  }

  overlapsWorldRect(r: Aabb): boolean {
    const minTx = Math.floor(r.x / TILE_SIZE);
    const maxTx = Math.floor((r.x + r.w - 1e-9) / TILE_SIZE);
    const minTy = Math.floor(r.y / TILE_SIZE);
    const maxTy = Math.floor((r.y + r.h - 1e-9) / TILE_SIZE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (this.clusterIdAt(tx, ty) >= 0) return true;
      }
    }
    return false;
  }

  clusterIdAtWorld(wx: number, wy: number): number {
    return this.clusterIdAt(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
  }

  clusterIdAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return -1;
    return this.clusterId[ty * this.width + tx]!;
  }

  isCellInCluster(tx: number, ty: number, clusterId: number): boolean {
    return clusterId >= 0 && this.clusterIdAt(tx, ty) === clusterId;
  }

  randomWalkDirInCluster(rng: JavaRandom, fromTx: number, fromTy: number, clusterId: number): [number, number] | null {
    if (clusterId < 0) return null;
    const choices: Array<[number, number]> = [];
    for (const [dx, dy] of NEIGH8) {
      if (this.isCellInCluster(fromTx + dx, fromTy + dy, clusterId)) choices.push([dx, dy]);
    }
    if (!choices.length) return null;
    return choices[rng.nextInt(choices.length)]!;
  }

  walkDirTowardCell(
    fromTx: number,
    fromTy: number,
    clusterId: number,
    toWx: number,
    toWy: number,
  ): [number, number] | null {
    if (clusterId < 0) return null;
    let bestDx = 0;
    let bestDy = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const [dx, dy] of NEIGH8) {
      const nx = fromTx + dx;
      const ny = fromTy + dy;
      if (!this.isCellInCluster(nx, ny, clusterId)) continue;
      const center = AmbientClusterMap.cellCenterWorld(nx, ny);
      const dist = Math.hypot(center[0] - toWx, center[1] - toWy);
      if (dist < bestDist) {
        bestDist = dist;
        bestDx = dx;
        bestDy = dy;
      }
    }
    return bestDist === Number.POSITIVE_INFINITY ? null : [bestDx, bestDy];
  }

  nearestCellCenterInCluster(wx: number, wy: number, id: number): [number, number] | null {
    const cells = this.components[id];
    if (!cells?.length) return null;
    let best = cells[0]!;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const c of cells) {
      const center = AmbientClusterMap.cellCenterWorld(c[0], c[1]);
      const dist = Math.hypot(center[0] - wx, center[1] - wy);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return AmbientClusterMap.cellCenterWorld(best[0], best[1]);
  }

  randomPointInCluster(rng: JavaRandom, id: number): [number, number] | null {
    const cells = this.components[id];
    if (!cells?.length) return null;
    const c = cells[rng.nextInt(cells.length)]!;
    return AmbientClusterMap.cellCenterWorld(c[0], c[1]);
  }

  randomPointInRandomCluster(rng: JavaRandom, excludeId: number): [number, number] | null {
    const choices: number[] = [];
    for (let i = 0; i < this.components.length; i++) {
      if (i !== excludeId && this.components[i]!.length > 0) choices.push(i);
    }
    if (!choices.length) return null;
    return this.randomPointInCluster(rng, choices[rng.nextInt(choices.length)]!);
  }

  pickRandomClusterId(rng: JavaRandom): number {
    if (!this.components.length) return -1;
    return rng.nextInt(this.components.length);
  }

  clusterSteps(fromId: number, toId: number): number {
    if (fromId < 0 || toId < 0 || fromId >= this.components.length || toId >= this.components.length) {
      return -1;
    }
    if (fromId === toId) return 0;
    const queue: number[] = [fromId];
    const dist = new Map<number, number>([[fromId, 0]]);
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi]!;
      const d = dist.get(cur)!;
      for (const [tx, ty] of this.components[cur]!) {
        for (const [ox, oy] of NEIGH8) {
          const nid = this.clusterIdAt(tx + ox, ty + oy);
          if (nid < 0 || nid === cur || dist.has(nid)) continue;
          if (nid === toId) return d + 1;
          dist.set(nid, d + 1);
          queue.push(nid);
        }
      }
    }
    return -1;
  }

  static cellCenterWorld(tx: number, ty: number): [number, number] {
    return [tx * TILE_SIZE + TILE_SIZE * 0.5, ty * TILE_SIZE + TILE_SIZE * 0.5];
  }

  static spawnAnchorForCellCenter(centerX: number, centerY: number, hullW: number, hullH: number): [number, number] {
    return [centerX - hullW * 0.5, centerY - hullH * 0.5];
  }
}
