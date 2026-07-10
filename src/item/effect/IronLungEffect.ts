import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { ItemEffect } from "./ItemEffect";
import type { RoomClearContext } from "./RoomClearContext";

export class IronLungEffect implements ItemEffect {
  static readonly ROOMS_PER_SOUL_HEART = 6;

  itemId(): string {
    return "IRON_LUNG";
  }

  onRoomCleared(ctx: RoomClearContext, inv: PlayerItemInventory): void {
    if (inv.stacksOf("IRON_LUNG") <= 0) return;
    const stats = ctx.player.stats;
    stats.ironLungRoomsCleared++;
    if (stats.ironLungRoomsCleared < IronLungEffect.ROOMS_PER_SOUL_HEART) return;
    stats.ironLungRoomsCleared -= IronLungEffect.ROOMS_PER_SOUL_HEART;
    ctx.player.health.grantSoulHeartsFilled(1);
  }
}
