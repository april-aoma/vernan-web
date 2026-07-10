/** Rolled temp boost and permanent track for KALEIDOSCOPE_EYE. */
export enum KaleidoscopeEyeStat {
  DAMAGE = 0,
  GROUND_SPEED = 1,
  AIR_SPEED = 2,
  LUCK = 3,
  GRAVITY = 4,
  RECOVER_EARLY = 5,
  RECOVER_LATE = 6,
  JUMP_SQUAT = 7,
  WINDUP = 8,
}

const ALL_STATS: readonly KaleidoscopeEyeStat[] = [
  KaleidoscopeEyeStat.DAMAGE,
  KaleidoscopeEyeStat.GROUND_SPEED,
  KaleidoscopeEyeStat.AIR_SPEED,
  KaleidoscopeEyeStat.LUCK,
  KaleidoscopeEyeStat.GRAVITY,
  KaleidoscopeEyeStat.RECOVER_EARLY,
  KaleidoscopeEyeStat.RECOVER_LATE,
  KaleidoscopeEyeStat.JUMP_SQUAT,
  KaleidoscopeEyeStat.WINDUP,
];

export function rollKaleidoscopeEyeStat(nextInt: (bound: number) => number): KaleidoscopeEyeStat {
  return ALL_STATS[nextInt(ALL_STATS.length)]!;
}

/** Short HUD label for the active temp stat. */
export function kaleidoscopeHudAbbrev(stat: KaleidoscopeEyeStat): string {
  switch (stat) {
    case KaleidoscopeEyeStat.DAMAGE:
      return "DMG";
    case KaleidoscopeEyeStat.GROUND_SPEED:
      return "SPD";
    case KaleidoscopeEyeStat.AIR_SPEED:
      return "AIR";
    case KaleidoscopeEyeStat.LUCK:
      return "LCK";
    case KaleidoscopeEyeStat.GRAVITY:
      return "GRV";
    case KaleidoscopeEyeStat.RECOVER_EARLY:
      return "REC-E";
    case KaleidoscopeEyeStat.RECOVER_LATE:
      return "REC-L";
    case KaleidoscopeEyeStat.JUMP_SQUAT:
      return "SQ";
    case KaleidoscopeEyeStat.WINDUP:
      return "WND";
  }
}

export function kaleidoscopeShownOnCombatHudRow(stat: KaleidoscopeEyeStat): boolean {
  return (
    stat === KaleidoscopeEyeStat.DAMAGE ||
    stat === KaleidoscopeEyeStat.JUMP_SQUAT ||
    stat === KaleidoscopeEyeStat.WINDUP
  );
}
