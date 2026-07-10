import type { ItemCatalog } from "../ItemCatalog";
import type { PlayerItemInventory } from "../PlayerItemInventory";
import type { PlayerStats } from "../../entity/PlayerStats";
import type { ItemEffect } from "./ItemEffect";
import type { ItemLandContext } from "./ItemLandContext";
import type { ItemPickupHost } from "./ItemPickupHost";
import type { RoomClearContext } from "./RoomClearContext";
import { AutismEffect } from "./AutismEffect";
import { BoxPickupEffect } from "./BoxPickupEffect";
import { IronLungEffect } from "./IronLungEffect";
import { KaleidoscopeEyeEffect } from "./KaleidoscopeEyeEffect";
import { LeotardEffect } from "./LeotardEffect";
import { MysteryGiftPickupEffect } from "./MysteryGiftPickupEffect";
import { PlugLandEffect } from "./PlugLandEffect";
import { ShieldBreakerEffect } from "./ShieldBreakerEffect";
import { ShyMaskEffect } from "./ShyMaskEffect";
import { SkirtEffect } from "./SkirtEffect";

/** Registry and dispatch for non-JSON item behaviors (Java ItemEffects). */
export class ItemEffects {
  private static readonly byItem = new Map<string, ItemEffect>();
  private static registered = false;

  private static ensureRegistered(): void {
    if (ItemEffects.registered) return;
    ItemEffects.registered = true;
    ItemEffects.register(new BoxPickupEffect());
    ItemEffects.register(new MysteryGiftPickupEffect());
    ItemEffects.register(new PlugLandEffect());
    ItemEffects.register(new KaleidoscopeEyeEffect());
    ItemEffects.register(new ShyMaskEffect());
    ItemEffects.register(new ShieldBreakerEffect());
    ItemEffects.register(new AutismEffect());
    ItemEffects.register(new LeotardEffect());
    ItemEffects.register(new IronLungEffect());
    ItemEffects.register(new SkirtEffect());
  }

  static register(effect: ItemEffect): void {
    ItemEffects.ensureRegistered();
    ItemEffects.byItem.set(effect.itemId(), effect);
  }

  static get(id: string): ItemEffect | undefined {
    ItemEffects.ensureRegistered();
    return ItemEffects.byItem.get(id);
  }

  static onPickup(picked: string, host: ItemPickupHost, catalog: ItemCatalog): void {
    ItemEffects.ensureRegistered();
    const effect = ItemEffects.byItem.get(picked);
    effect?.onPickup?.(host);
    ItemEffects.applyCatalogPickupStats(picked, host, catalog);
  }

  private static applyCatalogPickupStats(
    picked: string,
    host: ItemPickupHost,
    catalog: ItemCatalog,
  ): void {
    const def = catalog.def(picked);
    if (def.soulHeartsOnPickup > 0) {
      host.player().health.grantSoulHeartsFilled(def.soulHeartsOnPickup);
    }
    if (def.blackHeartsOnPickup > 0) {
      host.player().health.grantBlackHeartsFilled(def.blackHeartsOnPickup);
    }
    // Red heal on pickup is applied by the caller (overlay / collect path).
  }

  static contributeStats(inv: PlayerItemInventory, stats: PlayerStats): void {
    ItemEffects.ensureRegistered();
    for (const id of inv.ownedIds()) {
      const effect = ItemEffects.byItem.get(id);
      effect?.contributeStats?.(inv, stats);
    }
  }

  static onPlayerLanded(ctx: ItemLandContext, inv: PlayerItemInventory): void {
    ItemEffects.ensureRegistered();
    for (const id of inv.ownedIds()) {
      const effect = ItemEffects.byItem.get(id);
      effect?.onPlayerLanded?.(ctx, inv);
    }
  }

  static onRoomCleared(ctx: RoomClearContext, inv: PlayerItemInventory): void {
    ItemEffects.ensureRegistered();
    for (const id of inv.ownedIds()) {
      const effect = ItemEffects.byItem.get(id);
      effect?.onRoomCleared?.(ctx, inv);
    }
  }

  static tickPlugBonus(stats: PlayerStats): void {
    if (stats.plugBonusFramesRemaining > 0) {
      stats.plugBonusFramesRemaining--;
      if (stats.plugBonusFramesRemaining <= 0) {
        stats.plugDamageBonus = 0;
      }
    }
  }
}
