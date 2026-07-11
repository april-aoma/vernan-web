import { floorMod } from "../tileset/background/BackgroundPixelBuffers";
import type { CarryPayload } from "./CarryPayload";
import { CarryKind } from "./CarryKind";

export type FruitVariantStats = {
  speed: number;
  floatiness: number;
  bounciness: number;
  damping: number;
};

const BASE_WALL_BOUNCE = 0.55;
const BASE_FLOOR_BOUNCE = 0.42;
export const BASE_ARC_VY_RATIO = 0.55;
export const BASE_GENTLE_DROP_VY = 120;

const DEFAULT: FruitVariantStats = { speed: 1, floatiness: 1, bounciness: 1, damping: 0 };

const BY_VARIANT: FruitVariantStats[] = [
  { speed: 0.78, floatiness: 1.55, bounciness: 1, damping: 1 },
  { speed: 0.78, floatiness: 1, bounciness: 1, damping: 1 },
  { speed: 1, floatiness: 1.45, bounciness: 1, damping: 0.5 },
  { speed: 1, floatiness: 1, bounciness: 1, damping: 0.5 },
  { speed: 1.32, floatiness: 0.72, bounciness: 1.45, damping: 0 },
  { speed: 1.32, floatiness: 1, bounciness: 1.45, damping: 0.5 },
];

export function fruitStatsForVariant(variantIndex: number): FruitVariantStats {
  if (BY_VARIANT.length === 0) return DEFAULT;
  return BY_VARIANT[floorMod(variantIndex, BY_VARIANT.length)]!;
}

export function fruitStatsForPayload(payload: CarryPayload | null): FruitVariantStats {
  if (!payload || payload.kind !== CarryKind.FRUIT) return DEFAULT;
  return fruitStatsForVariant(payload.fruitVariantIndex);
}

export function gravityMultiplier(stats: FruitVariantStats): number {
  return stats.floatiness > 1e-6 ? 1 / stats.floatiness : 1;
}

export function wallBounce(stats: FruitVariantStats): number {
  return BASE_WALL_BOUNCE * stats.bounciness;
}

export function floorBounce(stats: FruitVariantStats): number {
  return BASE_FLOOR_BOUNCE * stats.bounciness;
}

export function arcThrowVy(stats: FruitVariantStats, throwSpeed: number): number {
  return -throwSpeed * BASE_ARC_VY_RATIO * stats.floatiness;
}

export function gentleDropVy(stats: FruitVariantStats): number {
  return BASE_GENTLE_DROP_VY * stats.speed;
}

export function applyAirDamping(
  stats: FruitVariantStats,
  dt: number,
  proj: { vx: number; vy: number },
): void {
  if (stats.damping <= 0 || dt <= 0) return;
  const factor = Math.max(0, 1 - stats.damping * dt);
  proj.vx *= factor;
  proj.vy *= factor;
}
