import { JavaRandom } from "../util/JavaRandom";
import { javaShuffle } from "../util/javaCollections";
import type { ItemCatalog } from "./ItemCatalog";

const SALT_ITEM_ROOM = 0x1743505314dan;
const SALT_BOSS_CLEAR = 0x8055c1ea4n;
const SALT_SHOP = 0x51040ac7beef5babn;
const SALT_SECRET = 0x5ec401d00d5n;

/**
 * Seeded no-repeat decks (Java PedestalItemDecks subset).
 */
export class PedestalItemDecks {
  private readonly itemRng: JavaRandom;
  private readonly bossRng: JavaRandom;
  private readonly shopRng: JavaRandom;
  private readonly secretRng: JavaRandom;
  private itemQueue: string[] = [];
  private bossQueue: string[] = [];
  private shopQueue: string[] = [];
  private secretQueue: string[] = [];
  private readonly acquired = new Set<string>();
  private readonly placedThisLevel = new Set<string>();

  constructor(
    private readonly catalog: ItemCatalog,
    runSeed: bigint,
  ) {
    this.itemRng = new JavaRandom(runSeed ^ SALT_ITEM_ROOM);
    this.bossRng = new JavaRandom(runSeed ^ SALT_BOSS_CLEAR);
    this.shopRng = new JavaRandom(runSeed ^ SALT_SHOP);
    this.secretRng = new JavaRandom(runSeed ^ SALT_SECRET);
    this.rebuildItemQueue();
    this.rebuildBossQueue();
    this.rebuildShopQueue();
    this.rebuildSecretQueue();
  }

  markAcquired(id: string): void {
    this.acquired.add(id);
    this.placedThisLevel.add(id);
    this.itemQueue = this.itemQueue.filter((x) => x !== id);
    this.bossQueue = this.bossQueue.filter((x) => x !== id);
    this.shopQueue = this.shopQueue.filter((x) => x !== id);
    this.secretQueue = this.secretQueue.filter((x) => x !== id);
  }

  /**
   * Java `commitAssigned` — reserve id for a pedestal this level without drawing from the deck
   * (boss-specific drops that bypass `drawBossClear`).
   */
  commitAssigned(id: string): void {
    this.placedThisLevel.add(id);
  }

  /** New dungeon floor: clear per-level placement, keep run-wide acquired. */
  beginDungeonLevel(): void {
    this.placedThisLevel.clear();
    this.rebuildItemQueue();
    this.rebuildBossQueue();
    this.rebuildShopQueue();
    this.rebuildSecretQueue();
  }

  drawItemRoom(): string {
    return this.drawFrom(this.itemQueue, () => this.rebuildItemQueue());
  }

  drawBossClear(): string {
    return this.drawFrom(this.bossQueue, () => this.rebuildBossQueue());
  }

  drawShop(): string {
    return this.drawFrom(this.shopQueue, () => this.rebuildShopQueue());
  }

  drawSecret(): string {
    return this.drawFrom(this.secretQueue, () => this.rebuildSecretQueue());
  }

  private drawFrom(queue: string[], rebuild: () => void): string {
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (this.acquired.has(id) || this.placedThisLevel.has(id)) continue;
      this.placedThisLevel.add(id);
      return id;
    }
    rebuild();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (this.acquired.has(id) || this.placedThisLevel.has(id)) continue;
      this.placedThisLevel.add(id);
      return id;
    }
    return this.catalog.poolFallback();
  }

  private rebuildItemQueue(): void {
    const pool = this.catalog.itemRoomEligible().filter((id) => !this.acquired.has(id));
    javaShuffle(pool, this.itemRng);
    this.itemQueue = pool;
  }

  private rebuildBossQueue(): void {
    const pool = this.catalog.bossClearEligible().filter((id) => !this.acquired.has(id));
    javaShuffle(pool, this.bossRng);
    this.bossQueue = pool;
  }

  private rebuildShopQueue(): void {
    const pool = this.catalog.shopEligible().filter((id) => !this.acquired.has(id));
    javaShuffle(pool, this.shopRng);
    this.shopQueue = pool;
  }

  private rebuildSecretQueue(): void {
    const pool = this.catalog.secretEligible().filter((id) => !this.acquired.has(id));
    javaShuffle(pool, this.secretRng);
    this.secretQueue = pool;
  }
}
