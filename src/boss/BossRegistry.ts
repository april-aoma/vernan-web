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

/** Java BossRegistry.pickForFloor — all kinds eligible; pick by seed. */
export function pickBossForFloor(_floor: number, contentSeed: bigint): BossEntry {
  const rng = new JavaRandom(contentSeed);
  const i = rng.nextInt(ENTRIES.length);
  return ENTRIES[i] ?? ENTRIES[0]!;
}

/** Phase 5a: always Possessed until other bosses are ported. */
export function pickBossPhase5a(_floor: number, _contentSeed: bigint): BossEntry {
  return ENTRIES[0]!;
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
