/** World collectible kinds from breakables (Java WorldPickup.Kind). */
export enum PickupKind {
  HEART = 0,
  KEY = 1,
  COIN_1 = 2,
  COIN_5 = 3,
  COIN_10 = 4,
}

const LOOT_SALT = 0x1007ab1e10adn;

/**
 * Deterministic loot inside TILE_BREAKABLE (Java BreakableLootRoll).
 * Separate stream from brick-shard VFX.
 */
export function terrainLootKind(
  runSeed: bigint,
  roomId: number,
  tx: number,
  ty: number,
): PickupKind | null {
  const seed =
    (runSeed ^
      BigInt(tx) * 0x9e3779b1n ^
      BigInt(ty) * 0x85ebca77n ^
      BigInt(roomId) * 37n ^
      LOOT_SALT) &
    0xffffffffffffffffn;
  return rollKind(mulberry(Number(seed & 0xffffffffn)));
}

export function terrainBrickRng(
  runSeed: bigint,
  roomId: number,
  tx: number,
  ty: number,
): () => number {
  let state =
    Number(runSeed & 0xffffffffn) ^
    (tx * 0x9e3779b1) ^
    (ty * 0x85ebca77) ^
    roomId * 37;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 0x100000000;
  };
}

export function rollKind(rnd: () => number): PickupKind | null {
  const r = rnd();
  if (r < 0.08) return PickupKind.HEART;
  if (r < 0.16) return PickupKind.KEY;
  if (r < 0.76) return rollCoinKind(rnd);
  return null;
}

/** Breakables coin weights 90:8:2. */
export function rollCoinKind(rnd: () => number): PickupKind {
  const d = rnd();
  if (d < 0.9) return PickupKind.COIN_1;
  if (d < 0.98) return PickupKind.COIN_5;
  return PickupKind.COIN_10;
}

function mulberry(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 0x100000000;
  };
}
