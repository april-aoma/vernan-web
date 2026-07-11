import { ItemPools } from "./ItemPools";
import { PedestalSpawnKind } from "./PedestalSpawnKind";

/**
 * Per-run set of item ids Vernan has already collected (Java RunItemPool).
 */
export class RunItemPool {
  private readonly acquired = new Set<string>();
  private readonly acquireOrder: string[] = [];

  clear(): void {
    this.acquired.clear();
    this.acquireOrder.length = 0;
  }

  markAcquired(id: string): void {
    if (!id || this.acquired.has(id)) return;
    this.acquired.add(id);
    this.acquireOrder.push(id);
  }

  acquireOrderIds(): readonly string[] {
    return this.acquireOrder;
  }

  isAcquired(id: string): boolean {
    return !!id && this.acquired.has(id);
  }

  eligibleNotAcquired(kind: PedestalSpawnKind): string[] {
    const pool = ItemPools.eligibleFor(kind);
    if (this.acquired.size === 0) return [...pool];
    return pool.filter((id) => !this.acquired.has(id));
  }
}
