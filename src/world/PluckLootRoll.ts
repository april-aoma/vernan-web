import { JavaRandom, toJavaLong } from "../util/JavaRandom";
import { ItemPools } from "../item/ItemPools";
import type { ItemCatalog } from "../item/ItemCatalog";
import { PickupKind } from "../world/BreakableLootRoll";
import { FRUIT_FRAME_COUNT } from "../carry/CarryFruitLayout";

const LOOT_SALT = 0x60a76e1e6a55n;
const FRUIT_VARIANT_SALT = 0x7f4a7c15e933n;

export enum PluckOutcomeKind {
  FRUIT = 0,
  COIN_10 = 1,
  HEART = 2,
  COIN_ANY = 3,
  ITEM = 4,
}

export type PluckOutcome = {
  kind: PluckOutcomeKind;
  coinKind: PickupKind | null;
  itemId: string | null;
};

function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function grassSeed(
  runSeed: bigint,
  roomId: number,
  tx: number,
  ty: number,
  decoTileId: string,
  salt: bigint,
): bigint {
  const tid = decoTileId ?? "";
  return (
    runSeed ^
    BigInt(tx) * 0x9e3779b1n ^
    BigInt(ty) * 0x85ebca77n ^
    BigInt(roomId) * 37n ^
    BigInt(javaStringHash(tid)) * 0xd1b54a32d192ed03n ^
    salt
  );
}

export function fruitVariantIndex(
  runSeed: bigint,
  roomId: number,
  tx: number,
  ty: number,
  decoTileId: string,
): number {
  const seed = grassSeed(runSeed, roomId, tx, ty, decoTileId, FRUIT_VARIANT_SALT);
  return new JavaRandom(toJavaLong(seed)).nextInt(FRUIT_FRAME_COUNT);
}

function grassRng(
  runSeed: bigint,
  roomId: number,
  tx: number,
  ty: number,
  decoTileId: string,
): JavaRandom {
  return new JavaRandom(toJavaLong(grassSeed(runSeed, roomId, tx, ty, decoTileId, LOOT_SALT)));
}

/** Predetermined outcome for a grass deco cell (80% fruit, 5% ×10 coin, 10% heart, 4% coin, 1% item). */
export function rollGrassLoot(
  runSeed: bigint,
  roomId: number,
  tx: number,
  ty: number,
  decoTileId: string,
): PluckOutcome {
  const rnd = grassRng(runSeed, roomId, tx, ty, decoTileId);
  const r = rnd.nextDouble();
  if (r < 0.8) return { kind: PluckOutcomeKind.FRUIT, coinKind: null, itemId: null };
  if (r < 0.85) return { kind: PluckOutcomeKind.COIN_10, coinKind: PickupKind.COIN_10, itemId: null };
  if (r < 0.95) return { kind: PluckOutcomeKind.HEART, coinKind: null, itemId: null };
  if (r < 0.99) {
    return {
      kind: PluckOutcomeKind.COIN_ANY,
      coinKind: rollCoinKindFromJava(rnd),
      itemId: null,
    };
  }
  return { kind: PluckOutcomeKind.ITEM, coinKind: null, itemId: rollGrassItemId(rnd, ItemPools.unionPool()) };
}

function rollCoinKindFromJava(rnd: JavaRandom): PickupKind {
  const d = rnd.nextDouble();
  if (d < 0.9) return PickupKind.COIN_1;
  if (d < 0.98) return PickupKind.COIN_5;
  return PickupKind.COIN_10;
}

function rollGrassItemId(rnd: JavaRandom, union: string[]): string {
  if (union.length === 0) return "HEART_LT3";
  return union[rnd.nextInt(union.length)] ?? "HEART_LT3";
}

/** Union of every pedestal pool id (Java PluckLootRoll.unionPool). */
export function unionPoolIds(catalog?: ItemCatalog | null): string[] {
  if (catalog) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of [
      ...catalog.itemRoomEligible(),
      ...catalog.bossClearEligible(),
      ...catalog.shopEligible(),
      ...catalog.secretEligible(),
    ]) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }
  return ItemPools.unionPool();
}

/** Item branch for an in-run pluck: skip acquired ids; fallback HEART_LT3. */
export function rollGrassItemForRun(
  runSeed: bigint,
  roomId: number,
  tx: number,
  ty: number,
  decoTileId: string,
  acquired: ReadonlySet<string>,
  catalog: ItemCatalog,
): string {
  const o = rollGrassLoot(runSeed, roomId, tx, ty, decoTileId);
  if (o.kind !== PluckOutcomeKind.ITEM) return o.itemId ?? "HEART_LT3";
  const rnd = grassRng(runSeed, roomId, tx, ty, decoTileId);
  rnd.nextDouble();
  rnd.nextDouble();
  const eligible = unionPoolIds(catalog).filter((id) => !acquired.has(id));
  if (eligible.length === 0) return "HEART_LT3";
  return eligible[rnd.nextInt(eligible.length)] ?? "HEART_LT3";
}
