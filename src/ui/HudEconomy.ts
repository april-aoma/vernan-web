/** HUD money/key display animation (Java tickHudEconomyDisplay / startCoinDrain). */
export const HUD_MONEY_DRAIN_FRAMES_PER_COIN = 4;

export class HudEconomyDisplay {
  moneyDisplayed = 0;
  keysDisplayed = 0;
  private moneyDrainFrames = 0;
  private moneyGainFrames = 0;
  private moneyCounter = 0;
  private keysGainFrames = 0;
  private keysGainCounter = 0;

  sync(money: number, keys: number): void {
    if (this.moneyDrainFrames <= 0 && this.moneyGainFrames <= 0) {
      this.moneyDisplayed = money;
    }
    if (this.keysGainFrames <= 0) {
      this.keysDisplayed = keys;
    }
  }

  /** After debiting live money — animate display down. */
  startCoinDrain(priceCoins: number, moneyAfterDebit: number): void {
    if (priceCoins <= 0) return;
    if (this.moneyDrainFrames <= 0) {
      this.moneyDisplayed = moneyAfterDebit + priceCoins;
    }
    this.moneyDrainFrames += priceCoins * HUD_MONEY_DRAIN_FRAMES_PER_COIN;
    this.moneyCounter = 0;
  }

  startResourceGain(coins: number, keys: number, moneyNow: number, keysNow: number): void {
    if (coins > 0) {
      if (this.moneyGainFrames <= 0 && this.moneyDrainFrames <= 0) {
        this.moneyDisplayed = moneyNow - coins;
      }
      this.moneyGainFrames += coins * HUD_MONEY_DRAIN_FRAMES_PER_COIN;
      this.moneyCounter = 0;
    }
    if (keys > 0) {
      if (this.keysGainFrames <= 0) {
        this.keysDisplayed = keysNow - keys;
      }
      this.keysGainFrames += keys * HUD_MONEY_DRAIN_FRAMES_PER_COIN;
      this.keysGainCounter = 0;
    }
  }

  tick(money: number, keys: number): void {
    if (this.moneyGainFrames > 0) {
      this.moneyGainFrames--;
      this.moneyCounter++;
      if (this.moneyCounter >= HUD_MONEY_DRAIN_FRAMES_PER_COIN) {
        this.moneyCounter = 0;
        if (this.moneyDisplayed < money) this.moneyDisplayed++;
      }
      if (this.moneyGainFrames <= 0) this.moneyDisplayed = money;
    } else if (this.moneyDrainFrames > 0) {
      this.moneyDrainFrames--;
      this.moneyCounter++;
      if (this.moneyCounter >= HUD_MONEY_DRAIN_FRAMES_PER_COIN) {
        this.moneyCounter = 0;
        if (this.moneyDisplayed > money) this.moneyDisplayed--;
      }
      if (this.moneyDrainFrames <= 0) this.moneyDisplayed = money;
    } else {
      this.moneyDisplayed = money;
    }

    if (this.keysGainFrames > 0) {
      this.keysGainFrames--;
      this.keysGainCounter++;
      if (this.keysGainCounter >= HUD_MONEY_DRAIN_FRAMES_PER_COIN) {
        this.keysGainCounter = 0;
        if (this.keysDisplayed < keys) this.keysDisplayed++;
      }
      if (this.keysGainFrames <= 0) this.keysDisplayed = keys;
    } else {
      this.keysDisplayed = keys;
    }
  }

  displayMoney(money: number): number {
    return this.moneyDrainFrames > 0 || this.moneyGainFrames > 0
      ? this.moneyDisplayed
      : money;
  }

  displayKeys(keys: number): number {
    return this.keysGainFrames > 0 ? this.keysDisplayed : keys;
  }
}

/** HUD money: at least 2 digits below 100. */
export function formatMoneyHud(money: number): string {
  if (money >= 100) return String(money | 0);
  return String(money | 0).padStart(2, "0");
}

export function formatHudDamageDisplay(attackDamage: number): string {
  let shown = attackDamage * 2;
  shown = Math.min(99.9, Math.max(0, shown));
  return shown.toFixed(1);
}

export function formatHudStatValue(value: number): string {
  return String(Math.min(99, Math.max(0, value | 0)));
}

/** UI health strip: 0 full, 1 half, 2 empty (2 HP per container). */
export function uiHeartFrameIndexForSlot(
  slotIndex: number,
  currentHp: number,
  maxHp: number,
): number {
  const capacity = Math.min(2, maxHp - 2 * slotIndex);
  if (capacity <= 0) return 2;
  const filled = Math.min(capacity, Math.max(0, currentHp - 2 * slotIndex));
  if (filled >= 2) return 0;
  if (filled >= 1) return 1;
  return 2;
}

/** Red container fill → frame (Java uiHeartFrameIndexForContainer). */
export function uiHeartFrameIndexForContainer(fill: number, capacity: number): number {
  if (fill + 1e-9 >= capacity) return 0;
  if (fill >= 0.5) return 1;
  return 2;
}

/** Soul / black: frame 0 = full, 1 = half (Java uiSpecialHeartFrameIndex). */
export function uiSpecialHeartFrameIndex(fill: number): number {
  return fill >= 1.5 ? 0 : 1;
}

export function heartSlotCount(maxHp: number): number {
  return Math.max(1, Math.ceil(maxHp / 2));
}
