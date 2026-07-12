/** D1 helpers for scores + crashes. */

export type ScoreEntry = {
  id: string;
  playerName: string;
  seed: number;
  floorReached: number;
  coins: number;
  enemiesKilled: number;
  enemiesKillDifficulty: number;
  durationSec: number;
  itemIds: string[];
  client: string;
  userId: string;
  createdAt: string;
};

export type CrashEntry = {
  id: string;
  message: string;
  stack: string;
  source: string;
  pageUrl: string;
  client: string;
  seed: number | null;
  floorReached: number | null;
  userAgent: string;
  createdAt: string;
};

type ScoreRow = {
  id: string;
  player_name: string;
  seed: number;
  floor_reached: number;
  coins: number;
  enemies_killed: number;
  enemies_kill_difficulty: number;
  duration_sec: number;
  item_ids: string;
  client: string;
  user_id: string;
  created_at: string;
};

type CrashRow = {
  id: string;
  message: string;
  stack: string;
  source: string;
  page_url: string;
  client: string;
  seed: number | null;
  floor_reached: number | null;
  user_agent: string;
  created_at: string;
};

function parseItemIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 64);
  } catch {
    return [];
  }
}

function rowToScore(r: ScoreRow): ScoreEntry {
  return {
    id: r.id,
    playerName: r.player_name,
    seed: r.seed,
    floorReached: r.floor_reached,
    coins: r.coins,
    enemiesKilled: r.enemies_killed,
    enemiesKillDifficulty: r.enemies_kill_difficulty ?? 0,
    durationSec: r.duration_sec,
    itemIds: parseItemIds(r.item_ids ?? "[]"),
    client: r.client ?? "",
    userId: r.user_id ?? "",
    createdAt: r.created_at,
  };
}

function rowToCrash(r: CrashRow): CrashEntry {
  return {
    id: r.id,
    message: r.message,
    stack: r.stack ?? "",
    source: r.source || "unknown",
    pageUrl: r.page_url ?? "",
    client: r.client ?? "",
    seed: r.seed,
    floorReached: r.floor_reached,
    userAgent: r.user_agent ?? "",
    createdAt: r.created_at,
  };
}

/** Rank order matches the previous in-memory compareScores. */
const SCORE_ORDER = `
  floor_reached DESC,
  coins DESC,
  enemies_killed DESC,
  enemies_kill_difficulty DESC,
  created_at ASC
`;

export async function listScores(db: D1Database, limit: number): Promise<ScoreEntry[]> {
  const { results } = await db
    .prepare(`SELECT * FROM scores ORDER BY ${SCORE_ORDER} LIMIT ?`)
    .bind(limit)
    .all<ScoreRow>();
  return (results ?? []).map(rowToScore);
}

export async function insertScore(db: D1Database, entry: ScoreEntry): Promise<void> {
  await db
    .prepare(
      `INSERT INTO scores (
        id, player_name, seed, floor_reached, coins, enemies_killed,
        enemies_kill_difficulty, duration_sec, item_ids, client, user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.id,
      entry.playerName,
      entry.seed,
      entry.floorReached,
      entry.coins,
      entry.enemiesKilled,
      entry.enemiesKillDifficulty,
      entry.durationSec,
      JSON.stringify(entry.itemIds),
      entry.client,
      entry.userId,
      entry.createdAt,
    )
    .run();
}

/** Drop rows outside the top `keep` by ranking (parity with old KV trim). */
export async function trimScores(db: D1Database, keep: number): Promise<void> {
  // Nested subquery required: SQLite forbids deleting from a table while selecting it.
  await db
    .prepare(
      `DELETE FROM scores WHERE id NOT IN (
        SELECT id FROM (
          SELECT id FROM scores ORDER BY ${SCORE_ORDER} LIMIT ?
        )
      )`,
    )
    .bind(keep)
    .run();
}

export async function listCrashes(db: D1Database, limit: number): Promise<CrashEntry[]> {
  const { results } = await db
    .prepare(`SELECT * FROM crashes ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<CrashRow>();
  return (results ?? []).map(rowToCrash);
}

export async function insertCrashesBatch(db: D1Database, entries: CrashEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO crashes (
      id, message, stack, source, page_url, client, seed, floor_reached, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  await db.batch(
    entries.map((e) =>
      stmt.bind(
        e.id,
        e.message,
        e.stack,
        e.source,
        e.pageUrl,
        e.client,
        e.seed,
        e.floorReached,
        e.userAgent,
        e.createdAt,
      ),
    ),
  );
}

export async function trimCrashes(db: D1Database, keep: number): Promise<void> {
  await db
    .prepare(
      `DELETE FROM crashes WHERE id NOT IN (
        SELECT id FROM (
          SELECT id FROM crashes ORDER BY created_at DESC LIMIT ?
        )
      )`,
    )
    .bind(keep)
    .run();
}

export async function scoreCount(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM scores`).first<{ c: number }>();
  return row?.c ?? 0;
}

export async function crashCount(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM crashes`).first<{ c: number }>();
  return row?.c ?? 0;
}
