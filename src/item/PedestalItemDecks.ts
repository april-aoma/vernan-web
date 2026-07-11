import { JavaRandom } from "../util/JavaRandom";
import { javaShuffle } from "../util/javaCollections";
import type { ItemCatalog } from "./ItemCatalog";
import { PedestalSpawnKind } from "./PedestalSpawnKind";
import { RunItemPool } from "./RunItemPool";

const SALT_ITEM_ROOM = 0x1743505314dan;
const SALT_BOSS_CLEAR = 0x8055c1ea4n;
const SALT_SHOP = 0x5b0b50d353n;
const SALT_SECRET = 0x5ec401d00d5n;

/**
 * Per-run no-repeat pedestal decks (Java PedestalItemDecks).
 */
export class PedestalItemDecks {
  private readonly runPool: RunItemPool;
  private readonly itemRng: JavaRandom;
  private readonly bossRng: JavaRandom;
  private readonly shopRng: JavaRandom;
  private readonly secretRng: JavaRandom;
  private itemQueue: string[] = [];
  private bossQueue: string[] = [];
  private shopQueue: string[] = [];
  private secretQueue: string[] = [];
  private readonly placedThisLevel = new Set<string>();

  constructor(
    private readonly catalog: ItemCatalog,
    runPool: RunItemPool,
    runSeed: bigint,
  ) {
    this.runPool = runPool;
    this.itemRng = new JavaRandom(0);
    this.bossRng = new JavaRandom(0);
    this.shopRng = new JavaRandom(0);
    this.secretRng = new JavaRandom(0);
    this.reset(runSeed);
  }

  /** Call on new run / full restart (Java PedestalItemDecks.reset). */
  reset(runSeed: bigint): void {
    this.itemRng.setSeed(runSeed ^ SALT_ITEM_ROOM);
    this.bossRng.setSeed(runSeed ^ SALT_BOSS_CLEAR);
    this.shopRng.setSeed(runSeed ^ SALT_SHOP);
    this.secretRng.setSeed(runSeed ^ SALT_SECRET);
    this.itemQueue = [];
    this.bossQueue = [];
    this.shopQueue = [];
    this.secretQueue = [];
    this.beginDungeonLevel();
  }

  runItemPool(): RunItemPool {
    return this.runPool;
  }

  /** Java RunItemPool.markAcquired + PedestalItemDecks.purgeAcquired. */
  markAcquired(id: string): void {
    this.runPool.markAcquired(id);
    this.purgeFromQueues(id);
  }

  private purgeFromQueues(id: string): void {
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
    if (!id) return;
    this.placedThisLevel.add(id);
  }

  /** New dungeon floor: clear per-level placement, keep run-wide acquired. */
  beginDungeonLevel(): void {
    this.placedThisLevel.clear();
  }

  drawItemRoom(): string {
    return this.draw(PedestalSpawnKind.ITEM_ROOM);
  }

  drawBossClear(): string {
    return this.draw(PedestalSpawnKind.BOSS_CLEAR);
  }

  drawShop(): string {
    return this.draw(PedestalSpawnKind.SHOP);
  }

  drawSecret(): string {
    return this.draw(PedestalSpawnKind.SECRET);
  }

  /** Up to {@code n} distinct items from {@code kind} (Java drawDistinct). */
  drawDistinct(kind: PedestalSpawnKind, n: number): string[] {
    if (n <= 0) return [];
    const poolSize = this.eligibleForDraw(kind).length;
    const want = Math.min(n, poolSize);
    if (want <= 0) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    let safety = poolSize * 4 + 4;
    while (out.length < want && safety-- > 0) {
      const next = this.draw(kind);
      if (seen.has(next)) continue;
      seen.add(next);
      out.push(next);
    }
    return out;
  }

  private draw(kind: PedestalSpawnKind): string {
    switch (kind) {
      case PedestalSpawnKind.ITEM_ROOM:
        return this.drawFrom(this.itemQueue, this.itemRng, kind);
      case PedestalSpawnKind.SHOP:
        return this.drawFrom(this.shopQueue, this.shopRng, kind);
      case PedestalSpawnKind.BOSS_CLEAR:
        return this.drawFrom(this.bossQueue, this.bossRng, kind);
      default:
        return this.drawFrom(this.secretQueue, this.secretRng, kind);
    }
  }

  private drawFrom(queue: string[], rng: JavaRandom, kind: PedestalSpawnKind): string {
    let safety = Math.max(8, this.eligibleForDraw(kind).length * 2 + 4);
    while (safety-- > 0) {
      if (queue.length === 0) {
        const eligible = this.eligibleForDraw(kind);
        if (eligible.length === 0) return this.catalog.poolFallback();
        queue.push(...eligible);
        javaShuffle(queue, rng);
      }
      const id = queue.shift()!;
      if (this.placedThisLevel.has(id)) continue;
      this.placedThisLevel.add(id);
      return id;
    }
    return this.catalog.poolFallback();
  }

  private eligibleForDraw(kind: PedestalSpawnKind): string[] {
    const pool = this.runPool.eligibleNotAcquired(kind);
    if (this.placedThisLevel.size === 0) return pool;
    return pool.filter((id) => !this.placedThisLevel.has(id));
  }
}
