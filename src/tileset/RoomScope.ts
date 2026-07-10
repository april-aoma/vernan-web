import { RoomKind } from "../world/DungeonTypes";

/** Optional room-kind allow/deny on a tile def (Java RoomScope). */
export type TileRoomScope = {
  allowRoomKinds?: string[];
  denyRoomKinds?: string[];
};

/**
 * @returns true if tile may appear in roomKind (missing scope = allowed everywhere).
 * Java RoomScope.allowsRoomKind — SECRET_ROOM matches SECRET + SUPER_SECRET.
 */
export function allowsRoomKind(
  scope: TileRoomScope | null | undefined,
  roomKind: RoomKind,
): boolean {
  if (!scope) return true;
  const allow = scope.allowRoomKinds;
  if (allow && allow.length > 0) {
    const rk = RoomKind[roomKind] ?? "NORMAL";
    for (const raw of allow) {
      const t = raw.trim();
      if (rk.toUpperCase() === t.toUpperCase()) return true;
      if (
        t.toUpperCase() === "SECRET_ROOM" &&
        (roomKind === RoomKind.SECRET || roomKind === RoomKind.SUPER_SECRET)
      ) {
        return true;
      }
    }
    return false;
  }
  const deny = scope.denyRoomKinds;
  if (deny && deny.length > 0) {
    const rk = RoomKind[roomKind] ?? "NORMAL";
    for (const raw of deny) {
      const t = raw.trim();
      if (rk.toUpperCase() === t.toUpperCase()) return false;
      if (
        t.toUpperCase() === "SECRET_ROOM" &&
        (roomKind === RoomKind.SECRET || roomKind === RoomKind.SUPER_SECRET)
      ) {
        return false;
      }
    }
  }
  return true;
}

/** Parse room kind token to RoomKind enum, or null if unknown. */
export function parseRoomKindToken(kindUpper: string): RoomKind | null {
  if (!kindUpper) return null;
  const key = kindUpper.trim().toUpperCase();
  if (key in RoomKind && typeof RoomKind[key as keyof typeof RoomKind] === "number") {
    return RoomKind[key as keyof typeof RoomKind] as RoomKind;
  }
  return null;
}
