/** One row from data/items.json (Phase 4a subset of fields). */
export type ItemDefinition = {
  id: string;
  displayName: string;
  flavor: string;
  spriteFileName: string;
  pickupEffectLine: string;
  damageBonusPerStack: number;
  luckPerStack: number;
  swordWidthBonusPerStack: number;
  attackWindupFramesBonusPerStack: number;
  attackActiveFramesBonusPerStack: number;
  jumpSquatFramesBonusPerStack: number;
  groundSpeedBonusPerStack: number;
  airSpeedBonusPerStack: number;
  climbSpeedBonusPerStack: number;
  attackRecoverEarlyFramesBonusPerStack: number;
  attackRecoverLateFramesBonusPerStack: number;
  groundFrictionFramesBonusPerStack: number;
  groundAccelFramesBonusPerStack: number;
  groundBrakeFramesBonusPerStack: number;
  damageMultiplierPerStack: number;
  redMaxBonusPerStack: number;
  soulHeartsOnPickup: number;
  blackHeartsOnPickup: number;
  redHeartsHealOnPickup: number;
  spawnItemRoom: boolean;
  spawnShop: boolean;
  spawnBossClear: boolean;
  spawnSecret: boolean;
  subweapon: boolean;
  /** Seconds of HUD cooldown after firing (0 = no overlay band). */
  subweaponCooldownSeconds: number;
  poolFallback: boolean;
};

export function parseItemRow(raw: Record<string, unknown>): ItemDefinition {
  const num = (k: string, d = 0) => {
    const v = raw[k];
    return typeof v === "number" && Number.isFinite(v) ? v : d;
  };
  const bool = (k: string, d = false) => {
    const v = raw[k];
    return typeof v === "boolean" ? v : d;
  };
  const str = (k: string, d = "") => {
    const v = raw[k];
    return typeof v === "string" ? v : d;
  };
  return {
    id: str("id"),
    displayName: str("displayName"),
    flavor: str("flavor"),
    spriteFileName: str("spriteFileName"),
    pickupEffectLine: str("pickupEffectLine"),
    damageBonusPerStack: num("damageBonusPerStack"),
    luckPerStack: num("luckPerStack"),
    swordWidthBonusPerStack: num("swordWidthBonusPerStack"),
    attackWindupFramesBonusPerStack: num("attackWindupFramesBonusPerStack"),
    attackActiveFramesBonusPerStack: num("attackActiveFramesBonusPerStack"),
    jumpSquatFramesBonusPerStack: num("jumpSquatFramesBonusPerStack"),
    groundSpeedBonusPerStack: num("groundSpeedBonusPerStack"),
    airSpeedBonusPerStack: num("airSpeedBonusPerStack"),
    climbSpeedBonusPerStack: num("climbSpeedBonusPerStack"),
    attackRecoverEarlyFramesBonusPerStack: num("attackRecoverEarlyFramesBonusPerStack"),
    attackRecoverLateFramesBonusPerStack: num("attackRecoverLateFramesBonusPerStack"),
    groundFrictionFramesBonusPerStack: num("groundFrictionFramesBonusPerStack"),
    groundAccelFramesBonusPerStack: num("groundAccelFramesBonusPerStack"),
    groundBrakeFramesBonusPerStack: num("groundBrakeFramesBonusPerStack"),
    damageMultiplierPerStack: num("damageMultiplierPerStack", 1),
    redMaxBonusPerStack: num("redMaxBonusPerStack"),
    soulHeartsOnPickup: num("soulHeartsOnPickup"),
    blackHeartsOnPickup: num("blackHeartsOnPickup"),
    redHeartsHealOnPickup: num("redHeartsHealOnPickup"),
    spawnItemRoom: bool("spawnItemRoom"),
    spawnShop: bool("spawnShop"),
    spawnBossClear: bool("spawnBossClear"),
    spawnSecret: bool("spawnSecret"),
    subweapon: bool("subweapon"),
    subweaponCooldownSeconds: num("subweaponCooldownSeconds"),
    poolFallback: bool("poolFallback"),
  };
}
