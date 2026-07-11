import { TILE_SIZE } from "../specs";
import type { DecoStamp } from "../tileset/placeAmbientDeco";
import type { TilesetProject } from "../tileset/TilesetProject";
import type { TileMap } from "../world/TileMap";
import { TILE_EMPTY } from "../world/TileMap";
import type { Player } from "../entity/Player";
import type { IceBlock } from "../entity/IceBlock";
import { pluckableIceIndexUnderFeet } from "../combat/IceBlockSupport";
import type { PluckTarget } from "../world/PluckTarget";
import type { ThrownCarryProjectile } from "./ThrownCarryProjectile";

const FRONT_PLUCK_EDGE_PX = 8;

export function resolveObjectId(project: TilesetProject | null, decoTileId: string): string | null {
  if (!project || !decoTileId) return null;
  const tid = decoTileId.trim();
  for (const obj of project.objectById.values()) {
    for (const tileId of obj.tileIds) {
      if (tileId === tid) return obj.id;
    }
  }
  if (tid === "grass") return "grass";
  return null;
}

export function isGardeningPluckableObject(
  project: TilesetProject | null,
  objectId: string | null,
): boolean {
  if (!objectId || !objectId.trim()) return false;
  const obj = project?.objectById.get(objectId.trim());
  if (obj) return obj.gardeningPluckable;
  const id = objectId.trim();
  return id === "grass" || id === "blue grass";
}

export function resolveGardeningPluckTarget(
  player: Player,
  map: TileMap,
  deco: readonly DecoStamp[] | null | undefined,
  project: TilesetProject | null,
  thrown: readonly ThrownCarryProjectile[],
  hiddenShellAt: (tx: number, ty: number) => boolean,
  iceBlocks: readonly IceBlock[] | null = null,
): PluckTarget | null {
  if (!player.onGround) return null;
  const facing = player.facing >= 0 ? 1 : -1;
  const feetCx = player.x + player.w * 0.5;
  const feetBottom = player.y + player.h;
  let feetTx = Math.floor(feetCx / TILE_SIZE);
  let feetTy = Math.floor(feetBottom / TILE_SIZE) - 1;
  if (feetTy < 0) feetTy = Math.floor(feetBottom / TILE_SIZE);

  const overlappingFruit = overlappingSettledFruit(player, thrown);
  if (overlappingFruit) return overlappingFruit;

  const iceIndex = iceBlocks?.length ? pluckableIceIndexUnderFeet(player, iceBlocks) : -1;
  if (iceIndex >= 0) return { kind: "ice_block", blockIndex: iceIndex };

  const grassFeet = grassAt(map, deco, project, feetTx, feetTy, facing, player);
  if (grassFeet) return grassFeet;

  const frontTx = feetTx + facing;
  const frontNearEdgeWorldX = facing > 0 ? frontTx * TILE_SIZE : (frontTx + 1) * TILE_SIZE;
  if (Math.abs(feetCx - frontNearEdgeWorldX) <= FRONT_PLUCK_EDGE_PX) {
    const grassFront = grassAt(map, deco, project, frontTx, feetTy, facing, player);
    if (grassFront) return grassFront;
  }

  const breakTy = breakableFloorUnderFeet(map, feetTx, feetBottom);
  if (breakTy != null && facingBreakable(player, feetTx, breakTy, facing)) {
    const shell = hiddenShellAt(feetTx, breakTy);
    return { kind: "breakable_floor", tx: feetTx, ty: breakTy, hiddenShell: shell };
  }
  return null;
}

function overlappingSettledFruit(
  player: Player,
  thrown: readonly ThrownCarryProjectile[],
): PluckTarget | null {
  const box = { x: player.x, y: player.y, w: player.w, h: player.h };
  for (const p of thrown) {
    if (!p.isSettledFruit()) continue;
    const fruitBox = { x: p.x, y: p.y, w: 16, h: 32 };
    if (rectsIntersect(box, fruitBox)) {
      return { kind: "settled_fruit", worldX: p.x, worldY: p.y };
    }
  }
  return null;
}

function breakableFloorUnderFeet(map: TileMap, feetTx: number, feetBottom: number): number | null {
  const tyCenter = Math.floor((feetBottom - 1e-3) / TILE_SIZE);
  for (let dty = 0; dty <= 1; dty++) {
    const ty = tyCenter + dty;
    if (ty >= 0 && ty < map.getHeight() && map.isBreakableTile(feetTx, ty)) return ty;
  }
  return null;
}

function facingBreakable(player: Player, tx: number, _ty: number, facing: number): boolean {
  const cx = tx * TILE_SIZE + TILE_SIZE * 0.5;
  const px = player.x + player.w * 0.5;
  return facing > 0 ? px <= cx + 1 : px >= cx - 1;
}

function grassAt(
  map: TileMap,
  deco: readonly DecoStamp[] | null | undefined,
  project: TilesetProject | null,
  tx: number,
  ty: number,
  facing: number,
  player: Player,
): PluckTarget | null {
  if (!deco?.length) return null;
  if (!facingTuft(player, tx, facing)) return null;
  for (const d of deco) {
    if (d.tx !== tx || d.ty !== ty) continue;
    const tid = d.tileId?.trim();
    if (!tid) continue;
    const objectId = resolveObjectId(project, tid);
    if (!isGardeningPluckableObject(project, objectId)) continue;
    if (map.tileAt(tx, ty) !== TILE_EMPTY) continue;
    return { kind: "grass", tx, ty, decoTileId: tid, objectId: objectId ?? tid };
  }
  return null;
}

function facingTuft(player: Player, tx: number, facing: number): boolean {
  const cx = tx * TILE_SIZE + TILE_SIZE * 0.5;
  const px = player.x + player.w * 0.5;
  return facing > 0 ? px <= cx + 2 : px >= cx - 2;
}

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
