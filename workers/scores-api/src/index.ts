/**
 * Vernan live scores + crash reports API for the static game client.
 * Auth (register/login) lives on the separate vernan-auth worker.
 *   GET/POST /api/scores
 *   GET/POST /api/crashes
 *
 * Storage: D1 (scores + crashes). Rate limits: Durable Object.
 * Crash POSTs enqueue to vernan-crashes; the queue consumer batch-writes D1.
 *
 * Score POST accepts an optional Bearer JWT issued by vernan-auth
 * (same AUTH_SECRET).
 */

import { optionalAuth, sanitizeDisplayName } from "./auth";
import {
  crashCount,
  insertCrashesBatch,
  insertScore,
  listCrashes,
  listScores,
  scoreCount,
  trimCrashes,
  trimScores,
  type CrashEntry,
  type ScoreEntry,
} from "./db";
import { RateLimiter } from "./rateLimiter";
import { peekErrorMessage, reportRequestTelemetry } from "./telemetry";

export { RateLimiter };

export interface Env {
  DB: D1Database;
  /** Legacy KV — used only to one-shot migrate old scores/crashes blobs. */
  SCORES: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  CRASH_QUEUE: Queue<CrashEntry>;
  /** HMAC secret for JWTs — must match vernan-auth. */
  AUTH_SECRET: string;
  /** Optional service binding to vernan-api-ops. */
  API_OPS?: Fetcher;
  /** Optional service binding to vernan-security. */
  SECURITY?: Fetcher;
}

const SCORES_KEY = "scores";
const CRASHES_KEY = "crashes";
const MAX_SCORES = 200;
const MAX_CRASHES = 100;
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 12;
const CRASH_RATE_LIMIT_MAX = 8;

const ALLOWED_ORIGINS = new Set([
  "https://april-aoma.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://april-aoma.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

function sanitizePlayerName(raw: unknown): string {
  return sanitizeDisplayName(raw);
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

function sanitizeText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\0/g, "").slice(0, max);
}

function formatUtcTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizeKillDifficulty(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

function optionalInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
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

function isCrashEntry(v: unknown): v is CrashEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.message === "string" &&
    typeof o.stack === "string" &&
    typeof o.source === "string" &&
    typeof o.pageUrl === "string" &&
    typeof o.client === "string" &&
    typeof o.userAgent === "string" &&
    typeof o.createdAt === "string" &&
    (o.seed === null || typeof o.seed === "number") &&
    (o.floorReached === null || typeof o.floorReached === "number")
  );
}

function validateScoreBody(
  body: Record<string, unknown>,
  playerName: string,
  userId: string,
): Omit<ScoreEntry, "id" | "createdAt"> {
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
    playerName: sanitizePlayerName(playerName),
    seed: seed | 0,
    floorReached: Math.floor(floorReached),
    coins: Math.floor(coins),
    enemiesKilled: Math.floor(enemiesKilled),
    enemiesKillDifficulty: Math.floor(enemiesKillDifficulty),
    durationSec,
    itemIds,
    client: sanitizeClient(body.client),
    userId: userId.slice(0, 64),
  };
}

function validateCrashBody(body: Record<string, unknown>): Omit<CrashEntry, "id" | "createdAt"> {
  const message = sanitizeText(body.message, 500).trim();
  if (!message) throw new Error("Invalid message");
  const source = sanitizeText(body.source, 64).trim() || "unknown";
  const seed = optionalInt(body.seed);
  const floorReached = optionalInt(body.floorReached);
  if (floorReached !== null && (floorReached < 0 || floorReached > 500)) {
    throw new Error("Invalid floor");
  }

  return {
    message,
    stack: sanitizeText(body.stack, 8000),
    source,
    pageUrl: sanitizeText(body.pageUrl ?? body.url, 500),
    client: sanitizeClient(body.client),
    seed,
    floorReached,
    userAgent: sanitizeText(body.userAgent, 300),
  };
}

async function rateLimited(
  env: Env,
  ip: string,
  prefix: string,
  max: number,
): Promise<boolean> {
  const id = env.RATE_LIMITER.idFromName(`${prefix}:${ip}`);
  const stub = env.RATE_LIMITER.get(id);
  const res = await stub.fetch("https://rate-limiter/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max, windowSec: RATE_LIMIT_WINDOW_SEC }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { allowed?: boolean };
  return data.allowed !== true;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * One-shot: if a D1 table is empty, copy the matching legacy KV JSON blob.
 * Safe to call on every request; no-ops once each table has rows.
 */
async function migrateFromKvIfNeeded(env: Env): Promise<void> {
  if ((await scoreCount(env.DB)) === 0) {
    const rawScores = await env.SCORES.get(SCORES_KEY);
    if (rawScores) {
      try {
        const parsed = JSON.parse(rawScores) as unknown;
        if (Array.isArray(parsed)) {
          const entries = parsed.filter(isScoreEntry).map((e) => ({
            ...e,
            enemiesKillDifficulty: normalizeKillDifficulty(e.enemiesKillDifficulty),
            itemIds: normalizeItemIds(e.itemIds),
            client: sanitizeClient(e.client),
            userId: typeof e.userId === "string" ? e.userId.slice(0, 64) : "",
            createdAt: formatUtcTimestamp(e.createdAt),
          }));
          for (const entry of entries) {
            try {
              await insertScore(env.DB, entry);
            } catch {
              // skip duplicates / bad rows
            }
          }
          await trimScores(env.DB, MAX_SCORES);
        }
      } catch {
        // ignore corrupt KV
      }
    }
  }

  if ((await crashCount(env.DB)) > 0) return;

  const rawCrashes = await env.SCORES.get(CRASHES_KEY);
  if (!rawCrashes) return;
  try {
    const parsed = JSON.parse(rawCrashes) as unknown;
    if (!Array.isArray(parsed)) return;
    const entries = parsed.filter(isCrashEntry).map((e) => ({
      ...e,
      message: sanitizeText(e.message, 500),
      stack: sanitizeText(e.stack, 8000),
      source: sanitizeText(e.source, 64) || "unknown",
      pageUrl: sanitizeText(e.pageUrl, 500),
      client: sanitizeClient(e.client),
      seed: optionalInt(e.seed),
      floorReached: optionalInt(e.floorReached),
      userAgent: sanitizeText(e.userAgent, 300),
      createdAt: formatUtcTimestamp(e.createdAt),
    }));
    await insertCrashesBatch(env.DB, entries);
    await trimCrashes(env.DB, MAX_CRASHES);
  } catch {
    // ignore
  }
}

async function handleScores(
  request: Request,
  env: Env,
  origin: string | null,
  url: URL,
): Promise<Response> {
  await migrateFromKvIfNeeded(env);

  if (request.method === "GET") {
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), MAX_SCORES)
      : 50;
    const rows = await listScores(env.DB, limit);
    return json(rows, 200, origin);
  }

  if (request.method === "POST") {
    const auth = await optionalAuth(request, env.AUTH_SECRET);
    if ("error" in auth) return json({ error: auth.error }, auth.status, origin);

    if (await rateLimited(env, clientIp(request), "rl", RATE_LIMIT_MAX)) {
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
      if (auth.user) {
        fields = validateScoreBody(body, auth.user.displayName, auth.user.id);
      } else {
        fields = validateScoreBody(body, sanitizePlayerName(body.playerName), "");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid score";
      return json({ error: msg }, 400, origin);
    }

    const entry: ScoreEntry = {
      id: crypto.randomUUID(),
      ...fields,
      createdAt: utcNow(),
    };

    await insertScore(env.DB, entry);
    await trimScores(env.DB, MAX_SCORES);
    return json(entry, 201, origin);
  }

  return json({ error: "Method not allowed" }, 405, origin);
}

async function handleCrashes(
  request: Request,
  env: Env,
  origin: string | null,
  url: URL,
): Promise<Response> {
  await migrateFromKvIfNeeded(env);

  if (request.method === "GET") {
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), MAX_CRASHES)
      : 50;
    const rows = await listCrashes(env.DB, limit);
    return json(rows, 200, origin);
  }

  if (request.method === "POST") {
    if (await rateLimited(env, clientIp(request), "rl:crash", CRASH_RATE_LIMIT_MAX)) {
      return json({ error: "Too many requests" }, 429, origin);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400, origin);
    }

    let fields: Omit<CrashEntry, "id" | "createdAt">;
    try {
      fields = validateCrashBody(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid crash";
      return json({ error: msg }, 400, origin);
    }

    const entry: CrashEntry = {
      id: crypto.randomUUID(),
      ...fields,
      createdAt: utcNow(),
    };

    // Fast path: enqueue; consumer batch-inserts into D1 (at-least-once, idempotent by id).
    await env.CRASH_QUEUE.send(entry);
    return json({ id: entry.id, createdAt: entry.createdAt }, 201, origin);
  }

  return json({ error: "Method not allowed" }, 405, origin);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const t0 = Date.now();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    let response: Response;
    if (url.pathname === "/api/scores") {
      response = await handleScores(request, env, origin, url);
    } else if (url.pathname === "/api/crashes") {
      response = await handleCrashes(request, env, origin, url);
    } else {
      response = json({ error: "Not found" }, 404, origin);
    }

    const errorMessage = await peekErrorMessage(response);
    ctx.waitUntil(
      reportRequestTelemetry(env, {
        service: "scores",
        route: url.pathname,
        method: request.method,
        status: response.status,
        latency_ms: Date.now() - t0,
        errorMessage,
      }),
    );
    return response;
  },

  async queue(batch: MessageBatch<CrashEntry>, env: Env): Promise<void> {
    const entries: CrashEntry[] = [];
    for (const msg of batch.messages) {
      const body = msg.body;
      if (isCrashEntry(body)) {
        entries.push({
          ...body,
          message: sanitizeText(body.message, 500),
          stack: sanitizeText(body.stack, 8000),
          source: sanitizeText(body.source, 64) || "unknown",
          pageUrl: sanitizeText(body.pageUrl, 500),
          client: sanitizeClient(body.client),
          seed: optionalInt(body.seed),
          floorReached: optionalInt(body.floorReached),
          userAgent: sanitizeText(body.userAgent, 300),
          createdAt: formatUtcTimestamp(body.createdAt),
        });
        msg.ack();
      } else {
        msg.retry();
      }
    }
    if (entries.length === 0) return;
    await insertCrashesBatch(env.DB, entries);
    await trimCrashes(env.DB, MAX_CRASHES);
  },
};
