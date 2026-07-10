import type { ItemEffect } from "./ItemEffect";
import type { ItemPickupHost } from "./ItemPickupHost";

/** SKIRT: on pickup, average ground accel/brake/friction and use that as the new baseline. */
export class SkirtEffect implements ItemEffect {
  itemId(): string {
    return "SKIRT";
  }

  onPickup(host: ItemPickupHost): void {
    const stats = host.stats();
    stats.skirtGroundTraction =
      (stats.groundAccel + stats.groundBrake + stats.groundFriction) / 3;
  }
}
