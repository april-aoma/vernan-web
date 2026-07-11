import { JavaRandom } from "../util/JavaRandom";
import type { IceBlock } from "../entity/IceBlock";
import type { Player } from "../entity/Player";
import type { DungeonLayout } from "./DungeonLayout";
import { RoomKind } from "./DungeonTypes";
import { PickupKind, rollRoomClearCoinKind } from "./BreakableLootRoll";
import type { TileMap } from "./TileMap";
import { TILE_SIZE } from "../specs";
import { WorldPickup } from "./WorldPickup";

const ROOM_CLEAR_SEED_SALT = 0xdec0de10n;

export function rollRoomClearPickupKind(rnd: () => number): PickupKind {
  const t = Math.floor(rnd() * 3);
  if (t === 0) return PickupKind.HEART;
  if (t === 1) return PickupKind.KEY;
  return rollRoomClearCoinKind(rnd);
}

function roomClearRng(
  runSeed: bigint,
  roomId: number,
  floorOrdinal: number,
  enemiesKilledThisRun: number,
): JavaRandom {
  const seed =
    runSeed ^
    BigInt(roomId) * 0xc2b2ae3dn ^
    BigInt(floorOrdinal) * 0x9e3779b97f4a7c15n ^
    BigInt(enemiesKilledThisRun) * 0xd1b54a32d192ed03n ^
    ROOM_CLEAR_SEED_SALT;
  return new JavaRandom(seed);
}

function iceBlockNearLastDeath(
  iceBlocks: readonly IceBlock[],
  lastFrozenIce: IceBlock | null,
  feetCx: number,
  feetY: number,
): IceBlock | null {
  if (lastFrozenIce) {
    const lr = lastFrozenIce.rect();
    if (Math.abs(lr.x + lr.w * 0.5 - feetCx) < 24 && Math.abs(lr.y + lr.h - feetY) < 24) {
      return lastFrozenIce;
    }
  }
  let best: IceBlock | null = null;
  let bestDist = Infinity;
  for (const block of iceBlocks) {
    const r = block.rect();
    const dx = r.x + r.w * 0.5 - feetCx;
    const dy = r.y + r.h - feetY;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = block;
    }
  }
  return bestDist < 32 * 32 ? best : null;
}

export type RoomClearRewardContext = {
  layout: DungeonLayout;
  roomId: number;
  floorOrdinal: number;
  runSeed: bigint;
  map: TileMap;
  player: Player;
  enemiesKilledThisRun: number;
  lastEnemyDeathFeetCenterX: number;
  lastEnemyDeathFeetY: number;
  iceBlocks: readonly IceBlock[];
  lastFrozenIce: IceBlock | null;
  worldPickups: WorldPickup[];
};

export function grantRoomClearRewards(ctx: RoomClearRewardContext): void {
  const node = ctx.layout.room(ctx.roomId);
  const rnd = roomClearRng(
    ctx.runSeed,
    ctx.roomId,
    ctx.floorOrdinal,
    ctx.enemiesKilledThisRun,
  );
  const feetCx = ctx.lastEnemyDeathFeetCenterX;
  const feetY = ctx.lastEnemyDeathFeetY;

  if (node.kind === RoomKind.NORMAL) {
    const grant = ctx.enemiesKilledThisRun % 6 === 0 || rnd.nextDouble() < 0.4;
    if (!grant) return;
    const drop = rollRoomClearPickupKind(() => rnd.nextDouble());
    if (ctx.player.inventory.stacksOf("ICE_BLOCK") > 0) {
      const target = iceBlockNearLastDeath(
        ctx.iceBlocks,
        ctx.lastFrozenIce,
        feetCx,
        feetY,
      );
      if (target) {
        target.addLoot(drop);
        return;
      }
    }
    ctx.worldPickups.push(
      WorldPickup.createFromRoomClear(drop, feetCx, feetY, () => rnd.nextDouble()),
    );
    return;
  }

  if (node.kind === RoomKind.BOSS && ctx.enemiesKilledThisRun % 6 === 0) {
    const burst = 2 + rnd.nextInt(5);
    const w = ctx.map.getWidth();
    for (let i = 0; i < burst; i++) {
      const drop = rnd.nextBoolean()
        ? rollRoomClearCoinKind(() => rnd.nextDouble())
        : PickupKind.HEART;
      const tx = Math.max(
        2,
        Math.min(w - 3, Math.floor(feetCx / TILE_SIZE + rnd.nextInt(5) - 2)),
      );
      ctx.worldPickups.push(
        WorldPickup.createFromBreakable(
          drop,
          tx * TILE_SIZE + TILE_SIZE * 0.5,
          ctx.map.groundTopWorldYAtColumn(tx),
          () => rnd.nextDouble(),
        ),
      );
    }
  }
}
