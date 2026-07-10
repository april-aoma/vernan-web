import type { PrimaryWeaponId } from "../combat/SwordVisual";
import { isPrimaryWeaponItem, PRIMARY_WEAPON_IDS } from "../combat/SwordVisual";

/**
 * Stacking inventory keyed by item id (Java PlayerItemInventory subset).
 * At most one subweapon may be equipped at a time.
 * With BACKPACK: cycle primary weapons (Shift+X) and subweapons (Shift+C).
 */
export class PlayerItemInventory {
  private readonly stacks = new Map<string, number>();
  private equippedSub: string | null = null;
  private preferredPrimary: PrimaryWeaponId | null = null;
  private readonly acquireSeq = new Map<string, number>();
  private acquireCounter = 0;
  /** null = vanilla sword when backpack owned. */
  private backpackSelectedPrimaryId: PrimaryWeaponId | null = null;
  private readonly backpackSubweapons = new Set<string>();
  private readonly backpackSubweaponAcquireSeq = new Map<string, number>();
  private backpackSubweaponSeqCounter = 0;

  add(id: string, amount = 1): number {
    const wasOwned = this.stacksOf(id) > 0;
    const next = (this.stacks.get(id) ?? 0) + amount;
    this.stacks.set(id, next);
    this.latchPreferredPrimaryWeapon(id);
    if (!wasOwned) {
      this.latchAcquireSeq(id);
      if (id === "BACKPACK") this.onBackpackAcquired();
    }
    return next;
  }

  stacksOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  has(id: string): boolean {
    return this.stacksOf(id) > 0;
  }

  hasBackpack(): boolean {
    return this.stacksOf("BACKPACK") > 0;
  }

  /** Owned item ids with stacks &gt; 0 (passives + subweapons). */
  ownedIds(): string[] {
    return [...this.stacks.entries()].filter(([, n]) => n > 0).map(([id]) => id);
  }

  preferredPrimaryWeapon(): PrimaryWeaponId | null {
    return this.preferredPrimary;
  }

  backpackSelectedPrimary(): PrimaryWeaponId | null {
    return this.backpackSelectedPrimaryId;
  }

  setBackpackSelectedPrimary(id: PrimaryWeaponId | null): void {
    this.backpackSelectedPrimaryId = id;
  }

  acquireSeqOf(id: string): number {
    return this.acquireSeq.get(id) ?? 0;
  }

  equippedSubweapon(): string | null {
    return this.equippedSub;
  }

  setEquippedSubweapon(id: string | null): void {
    this.equippedSub = id;
  }

  backpackPrimaryOptionCount(): number {
    if (!this.hasBackpack()) return 0;
    let count = 1;
    for (const id of PRIMARY_WEAPON_IDS) {
      if (this.stacksOf(id) > 0) count++;
    }
    return count;
  }

  backpackSubweaponOptionCount(): number {
    return this.backpackSubweapons.size;
  }

  backpackPrimaryCycleOrder(): Array<PrimaryWeaponId | null> {
    const owned: PrimaryWeaponId[] = [];
    for (const id of PRIMARY_WEAPON_IDS) {
      if (this.stacksOf(id) > 0) owned.push(id);
    }
    owned.sort((a, b) => this.acquireSeqOf(b) - this.acquireSeqOf(a));
    const order: Array<PrimaryWeaponId | null> = [...owned, null];
    return order;
  }

  backpackSubweaponCycleOrder(): string[] {
    const order = [...this.backpackSubweapons];
    order.sort(
      (a, b) =>
        (this.backpackSubweaponAcquireSeq.get(b) ?? 0) -
        (this.backpackSubweaponAcquireSeq.get(a) ?? 0),
    );
    return order;
  }

  cycleBackpackPrimary(steps: number): void {
    if (!this.hasBackpack() || steps <= 0) return;
    const order = this.backpackPrimaryCycleOrder();
    if (order.length < 2) return;
    let idx = this.indexOfPrimaryInCycle(order, this.backpackSelectedPrimaryId);
    if (idx < 0) idx = 0;
    this.backpackSelectedPrimaryId = order[(idx + steps) % order.length] ?? null;
  }

  cycleBackpackSubweapon(steps: number): string | null {
    if (!this.hasBackpack() || steps <= 0) return this.equippedSub;
    const order = this.backpackSubweaponCycleOrder();
    if (order.length < 2) return this.equippedSub;
    const eq = this.equippedSub;
    let idx = eq == null ? -1 : order.indexOf(eq);
    if (idx < 0) idx = 0;
    const next = order[(idx + steps) % order.length]!;
    this.equippedSub = next;
    return next;
  }

  registerBackpackSubweapon(id: string): void {
    if (!this.backpackSubweapons.has(id)) {
      this.backpackSubweapons.add(id);
      this.backpackSubweaponAcquireSeq.set(id, ++this.backpackSubweaponSeqCounter);
    }
  }

  onBackpackAcquired(): void {
    if (this.equippedSub) this.registerBackpackSubweapon(this.equippedSub);
    this.backpackSelectedPrimaryId = this.preferredPrimary;
  }

  clear(): void {
    this.stacks.clear();
    this.equippedSub = null;
    this.preferredPrimary = null;
    this.acquireSeq.clear();
    this.acquireCounter = 0;
    this.clearBackpackState();
  }

  private clearBackpackState(): void {
    this.backpackSelectedPrimaryId = null;
    this.backpackSubweapons.clear();
    this.backpackSubweaponAcquireSeq.clear();
    this.backpackSubweaponSeqCounter = 0;
  }

  private latchPreferredPrimaryWeapon(id: string): void {
    if (isPrimaryWeaponItem(id)) {
      this.preferredPrimary = id;
      if (this.hasBackpack()) this.backpackSelectedPrimaryId = id;
    }
  }

  private latchAcquireSeq(id: string): void {
    this.acquireSeq.set(id, ++this.acquireCounter);
  }

  private indexOfPrimaryInCycle(
    order: (PrimaryWeaponId | null)[],
    selected: PrimaryWeaponId | null,
  ): number {
    for (let i = 0; i < order.length; i++) {
      const slot = order[i];
      if (selected == null && slot == null) return i;
      if (selected != null && selected === slot) return i;
    }
    return -1;
  }
}
