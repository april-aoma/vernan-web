import { toJavaLong } from "../util/JavaRandom";

const SALT_FLOOR_LAYOUT = 0xf1a0f1008712026n;
const GOLDEN = 0x9e3779b97f4a7c15n;

/**
 * Derives floor layout seed from the immutable run seed.
 * Floor 1 returns {@code runSeed} unchanged (Java RunSeed.floorLayoutSeed).
 */
export function floorLayoutSeed(runSeed: bigint, floorOrdinal: number): bigint {
  if (floorOrdinal <= 1) return toJavaLong(runSeed);
  return toJavaLong(runSeed ^ (BigInt(floorOrdinal) * GOLDEN) ^ SALT_FLOOR_LAYOUT);
}

/** {@code 7 + (int)((layoutSeed >>> 32) % 5)} → 7..11 rooms. */
export function targetRoomCount(layoutSeed: bigint): number {
  const unsigned = BigInt.asUintN(64, toJavaLong(layoutSeed));
  const high = unsigned >> 32n;
  return 7 + Number(high % 5n);
}
