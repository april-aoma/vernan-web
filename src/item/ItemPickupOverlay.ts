import type { ItemCatalog } from "./ItemCatalog";
import { drawItemPickupCell } from "./ItemSpriteArt";
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from "../specs";

/** Java GamePanel.ITEM_PICKUP_OVERLAY_AUTO_DISMISS_SEC. */
export const ITEM_PICKUP_OVERLAY_AUTO_DISMISS_SEC = 2.75;

/**
 * Full-screen item pickup card (Java drawItemPickupOverlay).
 * Freezes gameplay while active — mount skips sim when {@link isActive}.
 */
export class ItemPickupOverlay {
  private active = false;
  private _itemId: string | null = null;
  private bonusLine = "";
  private timer = 0;

  begin(itemId: string, bonusLine = ""): void {
    this.active = true;
    this._itemId = itemId;
    this.bonusLine = bonusLine;
    this.timer = 0;
  }

  isActive(): boolean {
    return this.active;
  }

  get itemId(): string | null {
    return this._itemId;
  }

  tick(dtSec: number): void {
    if (!this.active) return;
    this.timer += dtSec;
    if (this.timer >= ITEM_PICKUP_OVERLAY_AUTO_DISMISS_SEC) {
      this.dismiss();
    }
  }

  dismiss(): void {
    this.active = false;
    this._itemId = null;
    this.bonusLine = "";
    this.timer = 0;
  }

  draw(
    g: CanvasRenderingContext2D,
    catalog: ItemCatalog,
    pickupBmp: ImageBitmap | null = null,
  ): void {
    if (!this.active || !this._itemId) return;
    const def = catalog.def(this._itemId);

    g.fillStyle = "rgba(0,0,0,0.784)"; // ~200/255
    g.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

    const title = def.displayName;
    const flavor = def.flavor;
    const effect =
      this.bonusLine.trim().length > 0 ? this.bonusLine : def.pickupEffectLine;

    const cx = INTERNAL_WIDTH / 2;
    const y0 = Math.max(16, Math.round(INTERNAL_HEIGHT * 0.06));

    // Pickup cell (left 16×16) at 2× under the title — matches in-world pixel scale.
    if (pickupBmp) {
      const cell = 32;
      drawItemPickupCell(g, pickupBmp, cx - cell / 2, y0, cell, cell);
    }

    const textY0 = pickupBmp ? y0 + 40 : y0;

    g.font = "12px monospace";
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.fillText(title, cx, textY0 + 12);

    g.fillStyle = "#dcd2eb";
    g.fillText(flavor, cx, textY0 + 32);

    g.font = "italic 10px monospace";
    g.fillStyle = "#b9afcd";
    g.fillText(effect, cx, textY0 + 50);

    g.textAlign = "left";
    g.font = "10px monospace";
  }
}
