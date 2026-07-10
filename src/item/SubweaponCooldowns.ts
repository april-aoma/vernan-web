/**
 * Per-item subweapon cooldown timers for HUD overlays (Java GamePanel arrays).
 * Gameplay fire is stubbed; {@link #begin} is ready when Track A wires use.
 */
export class SubweaponCooldowns {
  private remaining = new Map<string, number>();
  private total = new Map<string, number>();

  tick(dt: number): void {
    if (dt <= 0) return;
    for (const [id, rem] of this.remaining) {
      const next = rem - dt;
      if (next <= 0) {
        this.remaining.delete(id);
        this.total.delete(id);
      } else {
        this.remaining.set(id, next);
      }
    }
  }

  /** Start / refresh cooldown for an item (seconds). */
  begin(id: string, cooldownSeconds: number): void {
    if (cooldownSeconds <= 1e-9) {
      this.clear(id);
      return;
    }
    this.total.set(id, cooldownSeconds);
    this.remaining.set(id, cooldownSeconds);
  }

  clear(id: string): void {
    this.remaining.delete(id);
    this.total.delete(id);
  }

  remainingOf(id: string | null): number {
    if (!id) return 0;
    return this.remaining.get(id) ?? 0;
  }

  totalOf(id: string | null, fallbackSeconds = 0): number {
    if (!id) return 0;
    const t = this.total.get(id);
    if (t != null && t > 1e-9) return t;
    return fallbackSeconds;
  }

  isReady(id: string | null): boolean {
    return this.remainingOf(id) <= 0;
  }
}
