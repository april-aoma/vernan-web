import type { BackgroundPresetRegistry } from "../tileset/background";
import { RoomKind } from "./DungeonTypes";
import type { DungeonLayout } from "./DungeonLayout";

/** Boss / secret / super-secret use Earthbound-style math backgrounds. */
export function roomKindUsesMathBackground(kind: RoomKind): boolean {
  return (
    kind === RoomKind.BOSS ||
    kind === RoomKind.SECRET ||
    kind === RoomKind.SUPER_SECRET
  );
}

/**
 * Deterministic per-room preset ids (Java assignRoomMathBackgroundPresets).
 * Index = room id; null for rooms that do not use math backgrounds.
 */
export function assignRoomMathBackgroundPresets(
  layout: DungeonLayout,
  registry: BackgroundPresetRegistry,
): (string | null)[] {
  const n = layout.roomCount();
  const out: (string | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const node = layout.room(i);
    if (node.kind === RoomKind.BOSS) {
      out[i] = registry.pickBossPresetId(node.contentSeed);
    } else if (node.kind === RoomKind.SECRET || node.kind === RoomKind.SUPER_SECRET) {
      out[i] = registry.pickSecretPresetId(node.contentSeed);
    }
  }
  return out;
}
