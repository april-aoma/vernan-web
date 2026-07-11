import type { Player } from "../entity/Player";
import { JavaRandom, toJavaLong } from "../util/JavaRandom";
import { TILE_SIZE } from "../specs";
import { RoomKind } from "./DungeonTypes";
import {
  makeItemPedestal,
  pedestalItemAabb,
  resolvePedestalTileX,
  type ItemPedestal,
} from "./pedestal";
import type { RoomSession } from "./roomTransition";

/** Java GamePanel.K_CANDY_REFILL_PRICE. */
export const K_CANDY_REFILL_PRICE = 30;

/** Java GamePanel.K_CANDY_REFILL_SEED_SALT. */
const K_CANDY_REFILL_SEED_SALT = 0xca11d05eed5eedn;

export type KCandyRefillBuyResult = { price: number };

/**
 * Lazy SUPER_SECRET $30 k-candy refill pedestal (Java resolveSuperSecretKCandyRefillForRoom).
 * Spawns only when K_CANDY is equipped at first enter, with 1/5 chance.
 */
export function resolveSuperSecretKCandyRefill(
  session: RoomSession,
  equippedSubweapon: string | null,
): void {
  const roomId = session.roomId;
  if (roomId < 0 || roomId >= session.superSecretKCandyRefillResolved.length) return;
  if (session.superSecretKCandyRefillResolved[roomId]) return;
  session.superSecretKCandyRefillResolved[roomId] = true;

  const node = session.dungeon.layout.room(roomId);
  if (node.kind !== RoomKind.SUPER_SECRET) return;
  if (equippedSubweapon !== "K_CANDY") return;

  const rng = new JavaRandom(toJavaLong(node.contentSeed ^ K_CANDY_REFILL_SEED_SALT));
  if (rng.nextInt(5) !== 0) return;

  const g = session.dungeon.rooms[roomId]!;
  const map = g.map;
  const w = map.getWidth();
  const desired = rng.nextBoolean() ? Math.floor(w / 4) : Math.floor((3 * w) / 4);
  const cx = resolvePedestalTileX(
    w,
    desired,
    g.ladderColumnTx,
    g.leftDoorTileX,
    g.rightDoorTileX,
  );
  const groundTop = map.groundTopWorldYAtColumn(Math.max(1, Math.min(w - 2, cx)));
  const anchorX = cx * TILE_SIZE + TILE_SIZE * 0.5;
  session.superSecretKCandyRefill[roomId] = makeItemPedestal(
    "K_CANDY",
    anchorX,
    groundTop,
    K_CANDY_REFILL_PRICE,
  );
}

export function activeSuperSecretKCandyRefill(session: RoomSession): ItemPedestal | null {
  const node = session.dungeon.layout.room(session.roomId);
  if (node.kind !== RoomKind.SUPER_SECRET) return null;
  return session.superSecretKCandyRefill[session.roomId] ?? null;
}

/**
 * Up/W buy for SUPER_SECRET k-candy refill (Java tryBuySuperSecretKCandyRefill).
 * @returns buy result when coins were spent; null otherwise.
 * Overlap + Up with wrong weapon / broke still "handles" the press (no free collect).
 */
export function tryBuySuperSecretKCandyRefill(
  session: RoomSession,
  player: Player,
  upPressed: boolean,
  equippedSubweapon: string | null,
  onRefill: () => void,
): KCandyRefillBuyResult | null {
  if (!upPressed) return null;
  resolveSuperSecretKCandyRefill(session, equippedSubweapon);

  const node = session.dungeon.layout.room(session.roomId);
  if (node.kind !== RoomKind.SUPER_SECRET) return null;

  const ped = session.superSecretKCandyRefill[session.roomId];
  if (!ped || ped.collected || ped.itemId !== "K_CANDY") return null;

  const pick = pedestalItemAabb(ped);
  if (!pick || !player.hitboxPose().intersectsRect(pick)) return null;

  if (equippedSubweapon !== "K_CANDY") return null;
  if (player.stats.money < K_CANDY_REFILL_PRICE) return null;

  player.stats.money -= K_CANDY_REFILL_PRICE;
  onRefill();
  ped.collected = true;
  return { price: K_CANDY_REFILL_PRICE };
}
