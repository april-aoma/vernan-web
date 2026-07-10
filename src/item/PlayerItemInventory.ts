/**
 * Stacking inventory keyed by item id (Java PlayerItemInventory subset).
 * At most one subweapon may be equipped at a time.
 */
export class PlayerItemInventory {
  private readonly stacks = new Map<string, number>();
  private equippedSub: string | null = null;

  add(id: string, amount = 1): number {
    const next = (this.stacks.get(id) ?? 0) + amount;
    this.stacks.set(id, next);
    return next;
  }

  stacksOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  has(id: string): boolean {
    return this.stacksOf(id) > 0;
  }

  /** Owned item ids with stacks &gt; 0 (passives + subweapons). */
  ownedIds(): string[] {
    return [...this.stacks.entries()].filter(([, n]) => n > 0).map(([id]) => id);
  }

  equippedSubweapon(): string | null {
    return this.equippedSub;
  }

  setEquippedSubweapon(id: string | null): void {
    this.equippedSub = id;
  }

  clear(): void {
    this.stacks.clear();
    this.equippedSub = null;
  }
}
