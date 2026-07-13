/**
 * Find at least one floor-1 seed per catalog item (ITEM / SECRET / SHOP / boss clear).
 * Matches eagerlyResolveFloorItems (no boss draw until clear), then resolves boss reward.
 * Usage: npx vite-node scripts/find-floor1-item-seeds.mts [maxSeed]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PedestalItemDecks } from "../src/item/PedestalItemDecks";
import { PedestalSpawnKind } from "../src/item/PedestalSpawnKind";
import { parseItemRow, type ItemDefinition } from "../src/item/ItemDefinition";
import { ItemPools } from "../src/item/ItemPools";
import { RunItemPool } from "../src/item/RunItemPool";
import {
  bossRoomHasPossessed,
  pickPossessedSpecialReward,
} from "../src/item/possessedBossReward";
import { buildDungeon } from "../src/world/buildDungeon";
import { RoomKind } from "../src/world/DungeonTypes";
import { rollShopLayout, SHOP_LAYOUT_SALT } from "../src/world/Shop";
import { TILE_SIZE } from "../src/specs";

type Hit = { seed: number; where: string; displayName: string };

function loadCatalog(itemsPath: string): {
  defs: Map<string, ItemDefinition>;
  fallback: string;
  ids: string[];
} {
  const raw = JSON.parse(readFileSync(itemsPath, "utf8")) as { items?: unknown[] };
  const defs = new Map<string, ItemDefinition>();
  let fallback = "HEART_LT3";
  const list: ItemDefinition[] = [];
  const ids: string[] = [];
  for (const row of raw.items ?? []) {
    if (!row || typeof row !== "object") continue;
    const def = parseItemRow(row as Record<string, unknown>);
    if (!def.id) continue;
    defs.set(def.id, def);
    list.push(def);
    ids.push(def.id);
    if (def.poolFallback) fallback = def.id;
  }
  ItemPools.rebuild(list);
  return { defs, fallback, ids };
}

class DumpCatalog {
  constructor(
    private readonly defs: Map<string, ItemDefinition>,
    private readonly fallbackId: string,
  ) {}
  poolFallback(): string {
    return this.fallbackId;
  }
  def(id: string): ItemDefinition {
    const d = this.defs.get(id);
    if (!d) throw new Error(`Unknown item ${id}`);
    return d;
  }
}

/** Empty inventory stub for Possessed special reward at run start. */
const emptyInv = { stacksOf: () => 0 };

/**
 * Floor-1 items as assigned at run start (ITEM/SECRET/SHOP), plus boss clear reward.
 * Boss is resolved after pedestal draws so it does not pollute placedThisLevel.
 */
function floor1ItemHits(
  seed: number,
  catalog: DumpCatalog,
): { id: string; where: string }[] {
  const dungeon = buildDungeon(BigInt(seed), 1, 0);
  const decks = new PedestalItemDecks(catalog as never, new RunItemPool(), BigInt(seed));
  const n = dungeon.layout.roomCount();
  const hits: { id: string; where: string }[] = [];
  let bossRoom = -1;

  for (let i = 0; i < n; i++) {
    const node = dungeon.layout.room(i);
    const g = dungeon.rooms[i]!;
    const kind = node.kind;
    if (kind === RoomKind.ITEM) {
      const id = decks.drawItemRoom();
      hits.push({ id, where: `ITEM room ${i}` });
    } else if (kind === RoomKind.SECRET) {
      if (g.itemPedestal) {
        const id = decks.drawSecret();
        hits.push({ id, where: `SECRET room ${i}` });
      }
    } else if (kind === RoomKind.SHOP) {
      const map = g.map;
      const w = map.getWidth();
      const groundY: number[] = [];
      for (let x = 0; x < w; x++) {
        groundY.push(Math.round(map.groundTopWorldYAtColumn(x) / TILE_SIZE));
      }
      const ladderTxs = g.ladderColumnTx >= 0 ? [g.ladderColumnTx] : [];
      const doorTxs: number[] = [];
      if (g.leftDoorTileX >= 0) doorTxs.push(g.leftDoorTileX);
      if (g.rightDoorTileX >= 0) doorTxs.push(g.rightDoorTileX);
      const shopSeed = node.contentSeed ^ SHOP_LAYOUT_SALT;
      const layout = rollShopLayout(shopSeed, w, groundY, ladderTxs, doorTxs, 0);
      const shopItems = decks.drawDistinct(PedestalSpawnKind.SHOP, layout.pedestals.length);
      for (let j = 0; j < shopItems.length; j++) {
        hits.push({ id: shopItems[j]!, where: `SHOP room ${i} ped ${j}` });
      }
    } else if (kind === RoomKind.BOSS) {
      bossRoom = i;
    }
  }

  if (bossRoom >= 0) {
    const node = dungeon.layout.room(bossRoom);
    const g = dungeon.rooms[bossRoom]!;
    let id: string;
    let note: string;
    if (bossRoomHasPossessed(g.enemySpawns)) {
      id =
        pickPossessedSpecialReward(emptyInv as never, node.contentSeed) ??
        decks.drawBossClear();
      note = "Possessed special";
      decks.commitAssigned(id);
    } else {
      id = decks.drawBossClear();
      note = "boss clear deck";
    }
    hits.push({ id, where: `BOSS room ${bossRoom} (${note})` });
  }

  return hits;
}

function main(): void {
  const maxSeed = Number(process.argv[2] ?? "200000");
  const root = resolve(import.meta.dirname, "..");
  const { defs, fallback, ids } = loadCatalog(resolve(root, "public/assets/data/items.json"));
  const catalog = new DumpCatalog(defs, fallback);

  const found = new Map<string, Hit>();
  const missing = new Set(ids);

  for (let s = 1; s <= maxSeed && missing.size > 0; s++) {
    if (s % 5000 === 0) {
      console.error(`scanned=${s} remaining=${missing.size} [${[...missing].join(",")}]`);
    }
    let hits: { id: string; where: string }[];
    try {
      hits = floor1ItemHits(s, catalog);
    } catch (err) {
      console.error(`seed ${s} failed:`, err);
      continue;
    }
    for (const h of hits) {
      if (!missing.has(h.id)) continue;
      found.set(h.id, {
        seed: s,
        where: h.where,
        displayName: defs.get(h.id)?.displayName ?? h.id,
      });
      missing.delete(h.id);
    }
  }

  console.log(`# Floor-1 item seeds (maxSeed=${maxSeed})`);
  console.log(`# covered=${found.size}/${ids.length} missing=${missing.size}`);
  console.log();
  console.log("ITEM_ID\tSEED\tNAME\tWHERE\tURL");
  for (const id of ids) {
    const hit = found.get(id);
    if (!hit) {
      console.log(`${id}\tMISSING`);
      continue;
    }
    console.log(
      `${id}\t${hit.seed}\t${hit.displayName}\t${hit.where}\t?seed=${hit.seed}`,
    );
  }
  if (missing.size) {
    console.error("MISSING:", [...missing].join(", "));
    process.exitCode = 1;
  }
}

main();
