/** Z-order insert points for costume parts (Java CostumeSlot). */
export type CostumeSlot =
  | "BEHIND_BODY"
  | "AFTER_BASE"
  | "AFTER_LEGS"
  | "AFTER_ARM"
  | "AFTER_HAIR"
  | "AFTER_FACE"
  | "TOPMOST";

export const COSTUME_SLOT_ORDER: readonly CostumeSlot[] = [
  "BEHIND_BODY",
  "AFTER_BASE",
  "AFTER_LEGS",
  "AFTER_ARM",
  "AFTER_HAIR",
  "AFTER_FACE",
  "TOPMOST",
];
