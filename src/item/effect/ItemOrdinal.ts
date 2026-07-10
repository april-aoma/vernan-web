/**
 * Java `ItemId` declaration order (ordinal = seeded item RNG).
 * Keep in sync with desktop `game.item.ItemId`.
 */
export const ITEM_IDS_BY_ORDINAL: readonly string[] = [
  "PANTIES",
  "PINK_SCARF",
  "MAP",
  "PENTAGRAM",
  "SHIELD",
  "EMPTY_HEART",
  "LOVELY_HEART",
  "FLINT",
  "FRISBEE",
  "PSYCHIC_SPOON",
  "TAMIL_OM",
  "GEM_SWORD",
  "KURIBO_SHOE",
  "EYE_OF_HORUS",
  "EYE_OF_RA",
  "HEART_LT3",
  "ACRYLICS",
  "PACK_OF_SMOKES",
  "ALL_SEEING_EYE",
  "BOX",
  "CAT_EARS",
  "CAT_TAIL",
  "CHOKER",
  "FUZZY_HAT",
  "HEADBAND",
  "HOODIE",
  "MYSTERY_GIFT",
  "PLUG",
  "STICK",
  "LEMON",
  "LIL_POSSESSED",
  "POSSESSED_HEAD",
  "K_CANDY",
  "CRAWLER_HAT",
  "GARDENING_GLOVES",
  "SOUL_HEART",
  "OOPART_BRACELET",
  "ICE_BLOCK",
  "DISC01_SLIDE",
  "KALEIDOSCOPE_EYE",
  "WARP_ORB",
  "AFTERIMAGE",
  "PONCHO",
  "SHORTS",
  "HEELIES",
  "COOL_SHIRT",
  "STRIPED_SHIRT",
  "STRONG_LEGGINGS",
  "DISC02_WALLJUMP",
  "BLACK_PANTIES",
  "SHIELD_BREAKER",
  "BLACK_DAHLIA",
  "SHY_MASK",
  "DISC03_AIRDODGE",
  "HEART_OF_DARKNESS",
  "AUTISM",
  "LIL_MINER",
  "COMPASS",
  "BACKPACK",
  "RED_DYE",
  "DISC04_HEAVY",
  "BRA",
  "LEOTARD",
  "IRON_LUNG",
  "SLIPPERY_SOCKS",
  "SKIRT",
  "WHIP",
];

const ORDINAL_BY_ID = new Map<string, number>(
  ITEM_IDS_BY_ORDINAL.map((id, i) => [id, i]),
);

/** Java `ItemId.ordinal()`; unknown ids hash to a stable non-negative int. */
export function itemOrdinal(id: string): number {
  const known = ORDINAL_BY_ID.get(id);
  if (known !== undefined) return known;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return h >>> 0;
}
