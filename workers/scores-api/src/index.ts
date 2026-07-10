/**
 * Vernan live scores API — GET/POST /api/scores for the static game client.
 */

export interface Env {
  SCORES: KVNamespace;
}

type ScoreEntry = {
  id: string;
  playerName: string;
  seed: number;
  floorReached: number;
  coins: number;
  enemiesKilled: number;
  /** Sum of per-kill difficulty; 0 for legacy rows. */
  enemiesKillDifficulty: number;
  durationSec: number;
  itemIds: string[];
  /** e.g. web_0.1.19 / desktop_0.1.53; empty for legacy rows. */
  client: string;
  createdAt: string;
};

const SCORES_KEY = "scores";
const MAX_SCORES = 200;
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 12;

const ALLOWED_ORIGINS = new Set([
  "https://april-aoma.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://april-aoma.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  if (b.floorReached !== a.floorReached) return b.floorReached - a.floorReached;
  if (b.coins !== a.coins) return b.coins - a.coins;
  if (b.enemiesKilled !== a.enemiesKilled) return b.enemiesKilled - a.enemiesKilled;
  if (b.enemiesKillDifficulty !== a.enemiesKillDifficulty) {
    return b.enemiesKillDifficulty - a.enemiesKillDifficulty;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

function sanitizePlayerName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 20) : "";
  return s.length > 0 ? s : "Anonymous";
}

function normalizeItemIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 64);
}

function sanitizeClient(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 32);
  if (/^(web|desktop)_0\.\d+\.\d+$/.test(s)) return s;
  return "";
}

function formatUtcTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isScoreEntry(v: unknown): v is ScoreEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.playerName === "string" &&
    typeof o.seed === "number" &&
    typeof o.floorReached === "number" &&
    typeof o.coins === "number" &&
    typeof o.enemiesKilled === "number" &&
    typeof o.durationSec === "number" &&
    typeof o.createdAt === "string"
  );
}

function normalizeKillDifficulty(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

async function readScores(env: Env): Promise<ScoreEntry[]> {
  const raw = await env.SCORES.get(SCORES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isScoreEntry)
      .map((e) => ({
        ...e,
        enemiesKillDifficulty: normalizeKillDifficulty(
          (e as ScoreEntry).enemiesKillDifficulty,
        ),
        itemIds: normalizeItemIds(e.itemIds),
        client: sanitizeClient((e as ScoreEntry).client),
        createdAt: formatUtcTimestamp(e.createdAt),
      }))
      .sort(compareScores);
  } catch {
    return [];
  }
}

async function writeScores(env: Env, entries: ScoreEntry[]): Promise<void> {
  const trimmed = entries.sort(compareScores).slice(0, MAX_SCORES);
  await env.SCORES.put(SCORES_KEY, JSON.stringify(trimmed));
}

function validateBody(body: Record<string, unknown>): Omit<ScoreEntry, "id" | "createdAt"> {
  const seed = Number(body.seed);
  const floorReached = Number(body.floorReached);
  const coins = Number(body.coins);
  const enemiesKilled = Number(body.enemiesKilled);
  const enemiesKillDifficulty = Number(body.enemiesKillDifficulty);
  const durationSec = Number(body.durationSec);

  if (!Number.isFinite(seed)) throw new Error("Invalid seed");
  if (!Number.isFinite(floorReached) || floorReached < 1) throw new Error("Invalid floor");
  if (!Number.isFinite(coins) || coins < 0) throw new Error("Invalid coins");
  if (!Number.isFinite(enemiesKilled) || enemiesKilled < 0) throw new Error("Invalid kills");
  if (!Number.isFinite(enemiesKillDifficulty) || enemiesKillDifficulty < 0) {
    throw new Error("Invalid kill difficulty");
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) throw new Error("Invalid duration");
  if (
    floorReached > 500 ||
    coins > 999_999 ||
    enemiesKilled > 99_999 ||
    enemiesKillDifficulty > 9_999_999
  ) {
    throw new Error("Score out of range");
  }
  const itemIds = normalizeItemIds(body.itemIds);
  if (itemIds.length > 64) throw new Error("Invalid items");

  return {
    playerName: sanitizePlayerName(body.playerName),
    seed: seed | 0,
    floorReached: Math.floor(floorReached),
    coins: Math.floor(coins),
    enemiesKilled: Math.floor(enemiesKilled),
    enemiesKillDifficulty: Math.floor(enemiesKillDifficulty),
    durationSec,
    itemIds,
    client: sanitizeClient(body.client),
  };
}

async function rateLimited(env: Env, ip: string): Promise<boolean> {
  const key = `rl:${ip}`;
  const raw = await env.SCORES.get(key);
  const count = raw ? Number(raw) : 0;
  if (count >= RATE_LIMIT_MAX) return true;
  await env.SCORES.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
  return false;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname !== "/api/scores") {
      return json({ error: "Not found" }, 404, origin);
    }

    if (request.method === "GET") {
      const limitRaw = Number(url.searchParams.get("limit") ?? "50");
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(Math.floor(limitRaw), 1), MAX_SCORES)
        : 50;
      const rows = (await readScores(env)).slice(0, limit);
      return json(rows, 200, origin);
    }

    if (request.method === "POST") {
      const ip =
        request.headers.get("CF-Connecting-IP") ??
        request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
        "unknown";
      if (await rateLimited(env, ip)) {
        return json({ error: "Too many requests" }, 429, origin);
      }

      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON" }, 400, origin);
      }

      let fields: Omit<ScoreEntry, "id" | "createdAt">;
      try {
        fields = validateBody(body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid score";
        return json({ error: msg }, 400, origin);
      }

      const entry: ScoreEntry = {
        id: crypto.randomUUID(),
        ...fields,
        createdAt: utcNow(),
      };

      const existing = await readScores(env);
      existing.push(entry);
      await writeScores(env, existing);
      return json(entry, 201, origin);
    }

    return json({ error: "Method not allowed" }, 405, origin);
  },
};
