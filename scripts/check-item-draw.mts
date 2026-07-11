/**
 * Find seeds where the first ITEM enter (before shop) is a test item,
 * and SECRET has a pedestal with KURIBO_SHOE after that item draw.
 */
import { readFileSync } from "node:fs";
import { PedestalItemDecks } from "../src/item/PedestalItemDecks";
import { parseItemRow } from "../src/item/ItemDefinition";
import { ItemPools } from "../src/item/ItemPools";
import { RunItemPool } from "../src/item/RunItemPool";
import { buildDungeon } from "../src/world/buildDungeon";
import { RoomKind } from "../src/world/DungeonTypes";

const TARGET_ITEMS = new Set(["DISC03_AIRDODGE", "HEADBAND", "DISC01_SLIDE"]);

const raw = JSON.parse(readFileSync("public/assets/data/items.json", "utf8"));
const defs = new Map();
let fallback = "HEART_LT3";
const list = [];
for (const row of raw.items ?? []) {
  const def = parseItemRow(row);
  if (!def.id) continue;
  defs.set(def.id, def);
  list.push(def);
  if (def.poolFallback) fallback = def.id;
}
ItemPools.rebuild(list);
const catalog = {
  poolFallback: () => fallback,
  def: (id: string) => {
    const d = defs.get(id);
    if (!d) throw new Error(id);
    return d;
  },
};

const found: { seed: number; item: string; itemRoom: number; secretRoom: number }[] = [];
for (let s = 1; s <= 50000; s++) {
  const dungeon = buildDungeon(BigInt(s), 1, 0);
  let itemRoom = -1;
  let secretRoom = -1;
  for (let i = 0; i < dungeon.layout.roomCount(); i++) {
    const kind = dungeon.layout.room(i).kind;
    const g = dungeon.rooms[i]!;
    if (kind === RoomKind.ITEM && itemRoom < 0) itemRoom = i;
    if (kind === RoomKind.SECRET && g.itemPedestal) secretRoom = i;
  }
  if (itemRoom < 0 || secretRoom < 0) continue;

  const decks = new PedestalItemDecks(catalog as never, new RunItemPool(), BigInt(s));
  const item = decks.drawItemRoom();
  if (!TARGET_ITEMS.has(item)) continue;
  const secret = decks.drawSecret();
  if (secret !== "KURIBO_SHOE") continue;

  found.push({ seed: s, item, itemRoom, secretRoom });
  if (found.length >= 12) break;
  if (s % 2000 === 0) console.error(`scanned=${s} found=${found.length}`);
}

for (const f of found) {
  console.log(
    `seed=${f.seed} itemRoom=${f.itemRoom}→${f.item} secretRoom=${f.secretRoom}→KURIBO_SHOE`,
  );
}
