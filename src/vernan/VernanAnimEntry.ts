import { vernanAnimSlotFromMap, VERNAN_ANIM_PHASE_LABELS, type VernanAnimSlot } from "./VernanAnimSlot";

export type VernanAnimEntryKind = "strip" | "single" | "phase" | "virtual";
export type VernanAnimEntryTrigger = "on_enter" | "on_index_change" | "phase";

/** One logical animation entry in {@code data/vernan_anim_cues.json}. */
export type VernanAnimEntry = {
  readonly logicalKey: string;
  readonly spriteAnimKey: string;
  readonly kind: VernanAnimEntryKind;
  readonly trigger: VernanAnimEntryTrigger;
  readonly slots: readonly VernanAnimSlot[];
};

function parseKind(token: unknown): VernanAnimEntryKind {
  if (typeof token !== "string") return "strip";
  switch (token.toLowerCase()) {
    case "single":
      return "single";
    case "phase":
      return "phase";
    case "virtual":
      return "virtual";
    default:
      return "strip";
  }
}

function parseTrigger(token: unknown): VernanAnimEntryTrigger {
  if (typeof token !== "string") return "on_index_change";
  switch (token.toLowerCase()) {
    case "on_enter":
    case "onenter":
      return "on_enter";
    case "phase":
      return "phase";
    default:
      return "on_index_change";
  }
}

export function vernanAnimEntryFromMap(
  logicalKey: string,
  m: Record<string, unknown>,
): VernanAnimEntry {
  const spriteAnimKey = typeof m.spriteAnimKey === "string" ? m.spriteAnimKey : logicalKey;
  const kind = parseKind(m.kind);
  const trigger = parseTrigger(m.trigger);
  const slots: VernanAnimSlot[] = [];
  const rawSlots = m.slots;
  if (Array.isArray(rawSlots)) {
    for (let i = 0; i < rawSlots.length; i++) {
      const o = rawSlots[i];
      if (!o || typeof o !== "object" || Array.isArray(o)) continue;
      const defaultLabel =
        kind === "phase" && i < VERNAN_ANIM_PHASE_LABELS.length
          ? VERNAN_ANIM_PHASE_LABELS[i]!
          : `frame ${i}`;
      slots.push(vernanAnimSlotFromMap(o as Record<string, unknown>, defaultLabel));
    }
  }
  return { logicalKey, spriteAnimKey, kind, trigger, slots };
}
