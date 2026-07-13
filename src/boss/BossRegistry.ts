import { JavaRandom } from "../util/JavaRandom";

export enum BossKind {
  POSSESSED = 0,
  NEPHILIM = 1,
  MODERN_CHICKEN = 2,
}

export type BossEntry = {
  kind: BossKind;
  maxHealth: number;
};

const ENTRIES: BossEntry[] = [
  { kind: BossKind.POSSESSED, maxHealth: 32 },
  { kind: BossKind.NEPHILIM, maxHealth: 60 },
  { kind: BossKind.MODERN_CHICKEN, maxHealth: 224 },
];

/** Ported bosses only — exclude Modern Chicken until its spawn/combat path exists. */
const PICKABLE: BossEntry[] = ENTRIES.filter((e) => e.kind !== BossKind.MODERN_CHICKEN);

/** Pick among ported bosses by seed (Chicken omitted until ported). */
export function pickBossForFloor(_floor: number, contentSeed: bigint): BossEntry {
  const rng = new JavaRandom(contentSeed);
  const i = rng.nextInt(PICKABLE.length);
  return PICKABLE[i] ?? PICKABLE[0]!;
}

/** @deprecated Use pickBossForFloor — delegates for legacy call sites. */
export function pickBossPhase5a(floor: number, contentSeed: bigint): BossEntry {
  return pickBossForFloor(floor, contentSeed);
}

export function bossKindLabel(kind: BossKind): string {
  switch (kind) {
    case BossKind.POSSESSED:
      return "POSSESSED";
    case BossKind.NEPHILIM:
      return "NEPHILIM";
    case BossKind.MODERN_CHICKEN:
      return "CHICKEN";
    default:
      return "?";
  }
}
