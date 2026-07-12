import { RoomKind } from "./DungeonTypes";
import type { BuiltDungeon } from "./buildDungeon";
import type { EnemySpawnKind } from "./EnemySpawnBudget";
import { ensureShopResolved } from "./Shop";
import type { RoomSession } from "./roomTransition";

/**
 * Unique enemy/boss spawn kinds after buildDungeon (+ enrich).
 * Prefer post-enrich spawns so golden-roach / placement matches runtime.
 */
export function uniqueEnemySpawnKinds(dungeon: BuiltDungeon): Set<EnemySpawnKind> {
  const kinds = new Set<EnemySpawnKind>();
  for (const room of dungeon.rooms) {
    for (const s of room.enemySpawns) kinds.add(s.kind);
  }
  return kinds;
}

/**
 * Eagerly assign ITEM / SECRET / SUPER_SECRET pedestals and SHOP layouts for the
 * whole floor in room-index order so sprite preload matches gameplay draws.
 * Returns every assigned item id (may include duplicates).
 */
export function eagerlyResolveFloorItems(session: RoomSession, luck: number): string[] {
  const itemIds: string[] = [];
  const savedRoom = session.roomId;
  const layout = session.dungeon.layout;
  const n = layout.roomCount();

  for (let i = 0; i < n; i++) {
    const kind = layout.room(i).kind;
    const g = session.dungeon.rooms[i]!;
    const p = g.itemPedestal;
    if (p && !p.collected && p.itemId == null) {
      if (kind === RoomKind.ITEM) {
        p.itemId = session.decks.drawItemRoom();
      } else if (kind === RoomKind.SECRET || kind === RoomKind.SUPER_SECRET) {
        p.itemId = session.decks.drawSecret();
      }
    }
    if (p?.itemId) itemIds.push(p.itemId);

    if (kind === RoomKind.SHOP) {
      session.roomId = i;
      ensureShopResolved(session, luck);
      for (const ped of session.shopPedestals[i] ?? []) {
        if (ped.itemId) itemIds.push(ped.itemId);
      }
    }
  }

  session.roomId = savedRoom;
  return itemIds;
}

/** Collect already-assigned pedestal / shop / boss-clear item ids without drawing. */
export function collectResolvedFloorItemIds(session: RoomSession): string[] {
  const itemIds: string[] = [];
  const layout = session.dungeon.layout;
  for (let i = 0; i < layout.roomCount(); i++) {
    const p = session.dungeon.rooms[i]!.itemPedestal;
    if (p?.itemId) itemIds.push(p.itemId);
    for (const ped of session.shopPedestals[i] ?? []) {
      if (ped.itemId) itemIds.push(ped.itemId);
    }
    const boss = session.bossClearPedestals[i];
    if (boss?.itemId) itemIds.push(boss.itemId);
  }
  return itemIds;
}
