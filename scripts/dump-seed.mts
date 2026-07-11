/**
 * Structured dump for seed parity vs Java SeedParityDump.
 * Usage: npx vite-node scripts/dump-seed.mts [seed]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PedestalItemDecks } from "../src/item/PedestalItemDecks";
import { PedestalSpawnKind } from "../src/item/PedestalSpawnKind";
import { parseItemRow, type ItemDefinition } from "../src/item/ItemDefinition";
import { ItemPools } from "../src/item/ItemPools";
import { RunItemPool } from "../src/item/RunItemPool";
import { buildDungeon, roomKindLabel } from "../src/world/buildDungeon";
import { RoomKind } from "../src/world/DungeonTypes";
import { targetRoomCount } from "../src/world/RunSeed";
import { TILE_SIZE } from "../src/specs";
import { rollShopLayout, SHOP_LAYOUT_SALT } from "../src/world/Shop";
import { PickupKind } from "../src/world/WorldPickup";
import { enrichDungeonArt } from "../src/tileset/enrichDungeonArt";
import { TilesetProject } from "../src/tileset/TilesetProject";

function loadCatalog(itemsPath: string): {
  defs: Map<string, ItemDefinition>;
  fallback: string;
} {
  const raw = JSON.parse(readFileSync(itemsPath, "utf8")) as { items?: unknown[] };
  const defs = new Map<string, ItemDefinition>();
  let fallback = "HEART_LT3";
  const list: ItemDefinition[] = [];
  for (const row of raw.items ?? []) {
    if (!row || typeof row !== "object") continue;
    const def = parseItemRow(row as Record<string, unknown>);
    if (!def.id) continue;
    defs.set(def.id, def);
    list.push(def);
    if (def.poolFallback) fallback = def.id;
  }
  ItemPools.rebuild(list);
  return { defs, fallback };
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

function summarizeDeferred(
  pickups: { kind: number | string }[],
): string {
  if (!pickups.length) return "none";
  const nameOf = (k: number | string) =>
    typeof k === "number" ? (["HEART", "KEY", "COIN_1", "COIN_5", "COIN_10"][k] ?? String(k)) : String(k);
  const counts = new Map<string, number>();
  for (const p of pickups) {
    const name = nameOf(p.kind);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return `{${[...counts.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}}`;
}

function pickupKindName(k: PickupKind): string {
  switch (k) {
    case PickupKind.HEART:
      return "HEART";
    case PickupKind.KEY:
      return "KEY";
    case PickupKind.COIN_1:
      return "COIN_1";
    case PickupKind.COIN_5:
      return "COIN_5";
    case PickupKind.COIN_10:
      return "COIN_10";
  }
}

function dumpShopWeb(
  roomId: number,
  contentSeed: bigint,
  g: {
    map: { getWidth(): number; groundTopWorldYAtColumn(tx: number): number };
    ladderColumnTx: number;
    leftDoorTileX: number;
    rightDoorTileX: number;
  },
  decks: PedestalItemDecks,
  drawnIds: string[],
): void {
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

  // Match GamePanel.resolveDeferredShopLayoutForRoom: pre-xor then rollShopLayout xors again.
  const shopSeed = contentSeed ^ SHOP_LAYOUT_SALT;
  const layout = rollShopLayout(shopSeed, w, groundY, ladderTxs, doorTxs, 0);
  const shopItems = decks.drawDistinct(PedestalSpawnKind.SHOP, layout.pedestals.length);
  console.log(`SHOP room=${roomId} pedestals=${shopItems.length} pickups=${layout.pickups.length}`);
  for (let i = 0; i < shopItems.length; i++) {
    const itemId = shopItems[i]!;
    drawnIds.push(itemId);
    const slot = layout.pedestals[i]!;
    console.log(
      `  shopPed i=${i} item=${itemId} x=${slot.anchorX.toFixed(1)} y=${slot.groundTop.toFixed(1)}`,
    );
  }
  for (const p of layout.pickups) {
    console.log(
      `  shopPickup kind=${pickupKindName(p.kind)} x=${p.feetCenterX.toFixed(1)} y=${p.feetWorldY.toFixed(1)} cost=${p.priceCoins}`,
    );
  }
}

async function main(): Promise<void> {
  const seedArg = process.argv[2] ?? "1327655388";
  const seed = BigInt(seedArg);
  const root = resolve(import.meta.dirname, "..");
  const { defs, fallback } = loadCatalog(resolve(root, "public/assets/data/items.json"));
  const catalog = new DumpCatalog(defs, fallback);

  const tilesetRaw = JSON.parse(
    readFileSync(resolve(root, "public/assets/tileset/tileset.json"), "utf8"),
  ) as Record<string, unknown>;
  const tileset = TilesetProject.fromJson(tilesetRaw);

  // Java: ambient deco stamped during room gen on room RNG.
  const dungeon = buildDungeon(seed, 1, 0, tileset);
  const n = dungeon.layout.roomCount();
  const decks = new PedestalItemDecks(catalog as never, new RunItemPool(), seed);

  const contentSeeds = Array.from({ length: n }, (_, i) => dungeon.layout.room(i).contentSeed);
  enrichDungeonArt(dungeon, tileset, contentSeeds);

  console.log("=== SeedParityDump WEB ===");
  console.log(`seed=${seed}`);
  console.log(`floor=${dungeon.floorOrdinal}`);
  console.log(`targetRooms=${targetRoomCount(dungeon.layoutSeed)}`);
  console.log(`roomCount=${n}`);
  console.log(`combatTiles=${dungeon.combatW}x${dungeon.combatH}`);
  console.log(`specialTiles=${dungeon.oneScreenW}x${dungeon.oneScreenH}`);
  console.log(`seams=${dungeon.secretSeams.length}`);
  console.log();

  console.log("--- LAYOUT ---");
  for (let i = 0; i < n; i++) {
    const node = dungeon.layout.room(i);
    const g = dungeon.rooms[i]!;
    console.log(
      `room id=${i} kind=${roomKindLabel(node.kind)} gx=${node.gridX} gy=${node.gridY} contentSeed=${node.contentSeed} w=${g.map.getWidth()} h=${g.map.getHeight()} doorW=${node.doorWest} doorE=${node.doorEast} ladderN=${node.ladderNorth} ladderS=${node.ladderSouth} ladderTx=${g.ladderColumnTx}`,
    );
  }
  console.log();

  console.log("--- ITEMS (room-id order, luck=0 shop) ---");
  const drawnIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const node = dungeon.layout.room(i);
    const g = dungeon.rooms[i]!;
    const kind = node.kind;
    if (kind === RoomKind.ITEM) {
      const id = decks.drawItemRoom();
      drawnIds.push(id);
      const ped = g.itemPedestal;
      console.log(
        `ITEM room=${i} item=${id} pedX=${ped ? ped.anchorX.toFixed(1) : -1} pedY=${ped ? ped.groundTop.toFixed(1) : -1}`,
      );
    } else if (kind === RoomKind.SECRET) {
      if (g.itemPedestal) {
        const id = decks.drawSecret();
        drawnIds.push(id);
        console.log(`SECRET room=${i} pedestal item=${id}`);
      } else {
        console.log(`SECRET room=${i} loot=${summarizeDeferred(g.deferredFloorPickups)}`);
      }
    } else if (kind === RoomKind.SUPER_SECRET) {
      console.log(`SUPER_SECRET room=${i} loot=${summarizeDeferred(g.deferredFloorPickups)}`);
    } else if (kind === RoomKind.SHOP) {
      dumpShopWeb(i, node.contentSeed, g, decks, drawnIds);
    } else if (kind === RoomKind.BOSS) {
      const id = decks.drawBossClear();
      drawnIds.push(id);
      console.log(`BOSS_CLEAR room=${i} item=${id}`);
    }
  }
  console.log();

  console.log("--- ITEM QUALITIES (drawn) ---");
  for (const id of drawnIds) {
    const def = catalog.def(id);
    console.log(
      `qual ${id} dmg=${def.damageBonusPerStack.toFixed(3)} luck=${def.luckPerStack.toFixed(3)} dmgMult=${def.damageMultiplierPerStack.toFixed(3)} redMax=${def.redMaxBonusPerStack} soul=${def.soulHeartsOnPickup} black=${def.blackHeartsOnPickup} heal=${def.redHeartsHealOnPickup} pools=IR:${def.spawnItemRoom} SH:${def.spawnShop} BC:${def.spawnBossClear} SE:${def.spawnSecret}`,
    );
  }
  console.log();

  console.log("--- ENEMIES ---");
  for (let i = 0; i < n; i++) {
    const g = dungeon.rooms[i]!;
    for (const e of g.enemySpawns) {
      console.log(
        `enemy room=${i} kind=${e.kind.toUpperCase()} hp=${e.maxHealth} x=${Math.round(e.xPx)} y=${Math.round(e.yPx)} clear=${e.countsForRoomClear} variant=${e.variantId ?? "-"}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
