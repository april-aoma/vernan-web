/** Feet-pin row within Vernan frame art (Java VernanFeetAnchor). */
export const VernanFeetAnchor = {
  EXTENDED_FEET_ROW_PX: 32,
  STAND_SPRITE_W_PX: 32,

  usesStandBottomLeftLayout(animKey: string): boolean {
    return animKey === "attack1";
  },

  feetRowPx(animKey: string, frameHeight: number): number {
    if (frameHeight <= 0) return this.EXTENDED_FEET_ROW_PX;
    if (this.usesStandBottomLeftLayout(animKey)) return frameHeight;
    if (animKey === "leveltransition" || animKey === "getup") {
      return Math.min(this.EXTENDED_FEET_ROW_PX, frameHeight);
    }
    return frameHeight;
  },

  canvasWorldOriginX(
    playerOriginX: number,
    playerWidth: number,
    frameWidth: number,
    facing: number,
    animKey: string,
  ): number {
    const centerX = playerOriginX + playerWidth * 0.5;
    if (this.usesStandBottomLeftLayout(animKey)) {
      const standHalf = this.STAND_SPRITE_W_PX * 0.5;
      if (facing >= 0) return centerX - standHalf;
      return centerX + standHalf - frameWidth;
    }
    return centerX - frameWidth * 0.5;
  },

  canvasWorldOriginY(feetWorld: number, frameHeight: number, animKey: string): number {
    return feetWorld - this.feetRowPx(animKey, frameHeight);
  },
} as const;
