import { TILE_SIZE } from "../specs";

/** Tile type IDs — mirror game.world.TileMap. */
export const TILE_EMPTY = 0;
export const TILE_SOLID = 1;
export const TILE_DOOR = 2;
export const TILE_PLATFORM = 3;
export const TILE_LADDER = 4;
export const TILE_BREAKABLE = 5;
export const TILE_KEYBLOCK = 6;
export const TILE_KEYBLOCK_CONNECTOR = 7;

/**
 * Room tile grid. Outside the map is treated as solid (same as Java TileMap).
 */
export class TileMap {
  readonly width: number;
  readonly height: number;
  private readonly tiles: number[][];

  private constructor(tiles: number[][]) {
    this.height = tiles.length;
    this.width = tiles[0]?.length ?? 0;
    // Densify so sparse source rows cannot leave holes (tiles[y] undefined).
    this.tiles = Array.from({ length: this.height }, (_, y) => {
      const row = tiles[y];
      if (!row) return Array(this.width).fill(TILE_EMPTY);
      const copy = row.slice(0, this.width);
      while (copy.length < this.width) copy.push(TILE_EMPTY);
      return copy;
    });
  }

  static fromGrid(tiles: number[][]): TileMap {
    return new TileMap(tiles);
  }

  /** ASCII: # solid, D door, - platform, H ladder, B breakable, K/k keyblock, else empty. */
  static fromAscii(rows: string[]): TileMap {
    const height = rows.length;
    let width = 0;
    for (const r of rows) width = Math.max(width, r.length);
    const grid: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row = rows[y] ?? "";
      const line: number[] = [];
      for (let x = 0; x < width; x++) {
        const c = x < row.length ? row.charAt(x) : ".";
        line.push(charToTile(c));
      }
      grid.push(line);
    }
    return new TileMap(grid);
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  /**
   * Floor to cell indices (JS numbers are floats; Java TileMap takes ints).
   * Non-finite coords are treated as out of bounds.
   */
  private cell(tx: number, ty: number): { x: number; y: number } | null {
    const x = Math.floor(tx);
    const y = Math.floor(ty);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(tx: number, ty: number): number {
    const c = this.cell(tx, ty);
    if (!c || !this.inBounds(c.x, c.y)) return TILE_SOLID;
    return this.tiles[c.y]![c.x]!;
  }

  setTile(tx: number, ty: number, tileId: number): void {
    const c = this.cell(tx, ty);
    if (!c || !this.inBounds(c.x, c.y)) return;
    this.tiles[c.y]![c.x] = tileId;
  }

  isSolidTile(tx: number, ty: number): boolean {
    const c = this.cell(tx, ty);
    // Outside / invalid → solid (same as Java TileMap).
    if (!c || !this.inBounds(c.x, c.y)) return true;
    const t = this.tiles[c.y]![c.x]!;
    return (
      t === TILE_SOLID ||
      t === TILE_BREAKABLE ||
      t === TILE_KEYBLOCK ||
      t === TILE_KEYBLOCK_CONNECTOR
    );
  }

  isSolidAtPixel(px: number, py: number): boolean {
    return this.isSolidTile(px / TILE_SIZE, py / TILE_SIZE);
  }

  isPlatformTile(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === TILE_PLATFORM;
  }

  isLadderTile(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === TILE_LADDER;
  }

  isDoorTile(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === TILE_DOOR;
  }

  isBreakableTile(tx: number, ty: number): boolean {
    const c = this.cell(tx, ty);
    if (!c || !this.inBounds(c.x, c.y)) return false;
    return this.tiles[c.y]![c.x]! === TILE_BREAKABLE;
  }

  isStandableFloorTile(tx: number, ty: number): boolean {
    const c = this.cell(tx, ty);
    if (!c || !this.inBounds(c.x, c.y)) return false;
    const t = this.tiles[c.y]![c.x]!;
    return t === TILE_SOLID || t === TILE_BREAKABLE || t === TILE_PLATFORM;
  }

  isLadderMouthDeckAt(tx: number, ty: number): boolean {
    const c = this.cell(tx, ty);
    if (!c || !this.inBounds(c.x, c.y)) return false;
    return this.isPlatformTile(c.x, c.y) && c.y + 1 < this.height && this.isLadderTile(c.x, c.y + 1);
  }

  /** True when the ground-top floor row in this column is a ladder mouth deck. */
  isLadderMouthSpawnColumn(tx: number): boolean {
    if (tx < 0 || tx >= this.width) return false;
    const groundTop = this.groundTopWorldYAtColumn(tx);
    const floorRow = Math.round(groundTop / TILE_SIZE);
    return this.isLadderMouthDeckAt(tx, floorRow);
  }

  /** World Y of the main walkable floor top in column tx (Java groundTopWorldYAtColumn). */
  groundTopWorldYAtColumn(tx: number): number {
    if (tx < 0 || tx >= this.width) return 0;
    let groundTop = (this.height - 2) * TILE_SIZE;
    let found = false;
    for (let ty = 1; ty < this.height - 2; ty++) {
      const t = this.tileAt(tx, ty);
      if (t === TILE_SOLID || t === TILE_BREAKABLE) continue;
      if (this.isStandableFloorTile(tx, ty + 1)) {
        groundTop = (ty + 1) * TILE_SIZE;
        found = true;
      }
    }
    if (found) return groundTop;
    for (let ty = this.height - 2; ty >= 1; ty--) {
      if (this.isStandableFloorTile(tx, ty)) return ty * TILE_SIZE;
    }
    return groundTop;
  }

  static tileToAsciiChar(tileId: number): string {
    switch (tileId) {
      case TILE_SOLID:
        return "#";
      case TILE_DOOR:
        return "D";
      case TILE_PLATFORM:
        return "-";
      case TILE_LADDER:
        return "H";
      case TILE_BREAKABLE:
        return "B";
      case TILE_KEYBLOCK:
        return "K";
      case TILE_KEYBLOCK_CONNECTOR:
        return "k";
      default:
        return ".";
    }
  }
}

function charToTile(c: string): number {
  switch (c) {
    case "#":
      return TILE_SOLID;
    case "D":
      return TILE_DOOR;
    case "-":
      return TILE_PLATFORM;
    case "H":
      return TILE_LADDER;
    case "B":
      return TILE_BREAKABLE;
    case "K":
      return TILE_KEYBLOCK;
    case "k":
      return TILE_KEYBLOCK_CONNECTOR;
    default:
      return TILE_EMPTY;
  }
}
