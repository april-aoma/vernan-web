import type { RunSummary, ScoreEntry } from "./types";
import { authHeaders, loadAuthSession } from "./authStore";
import { webClientId } from "./clientVersion";
import { trackProductEvent } from "../diagnostics/productMetrics";

const STORAGE_KEY = "vernan-web-scores";
const NAME_KEY = "vernan-web-player-name";
const MAX_LOCAL = 200;
const MIRROR_DOWNLOAD_NAME = "scores.json";

/**
 * Default: load the committed mirror from GitHub raw content (not GitHub Pages).
 * Override with `?scoresMirror=` or `VITE_SCORES_MIRROR_URL`.
 */
const DEFAULT_GITHUB_RAW_MIRROR =
  "https://raw.githubusercontent.com/april-aoma/vernan-web/master/data/scores.json";

function scoresApiBase(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("scoresApi");
    if (fromQuery) return fromQuery.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  const fromEnv = import.meta.env.VITE_SCORES_API;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return null;
}

/** URL of the read-only scores mirror (GitHub raw in production). */
export function scoresMirrorUrl(): string {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("scoresMirror");
    if (fromQuery) return fromQuery;
  } catch {
    /* ignore */
  }
  const fromEnv = import.meta.env.VITE_SCORES_MIRROR_URL;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  if (import.meta.env.DEV) {
    return new URL("/__repo/scores.json", window.location.origin).href;
  }
  return DEFAULT_GITHUB_RAW_MIRROR;
}

function readLocal(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parseScoreList(parsed);
  } catch {
    return [];
  }
}

function writeLocal(entries: ScoreEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_LOCAL)));
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

function normalizeItemIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 64);
}

/** Accept `web_0.1.N` / `desktop_0.1.N` (or legacy empty). */
export function sanitizeClientId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 32);
  if (/^(web|desktop)_0\.\d+\.\d+$/.test(s)) return s;
  return "";
}

function parseScoreList(data: unknown): ScoreEntry[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isScoreEntry).map((e) => {
    const raw = e as ScoreEntry & { userId?: unknown };
    const userIdRaw = raw.userId;
    const userId =
      typeof userIdRaw === "string" && userIdRaw.trim().length > 0
        ? userIdRaw.trim().slice(0, 64)
        : "";
    return {
      ...e,
      enemiesKillDifficulty:
        typeof raw.enemiesKillDifficulty === "number" &&
        Number.isFinite(raw.enemiesKillDifficulty)
          ? Math.max(0, Math.floor(raw.enemiesKillDifficulty))
          : 0,
      itemIds: normalizeItemIds(raw.itemIds),
      client: sanitizeClientId(raw.client),
      userId,
      createdAt: formatUtcTimestamp(e.createdAt),
    };
  });
}

/** Rank: floor → coins → kills → kill difficulty (desc), then earliest submit wins ties. */
export function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  if (b.floorReached !== a.floorReached) return b.floorReached - a.floorReached;
  if (b.coins !== a.coins) return b.coins - a.coins;
  if (b.enemiesKilled !== a.enemiesKilled) return b.enemiesKilled - a.enemiesKilled;
  if (b.enemiesKillDifficulty !== a.enemiesKillDifficulty) {
    return b.enemiesKillDifficulty - a.enemiesKillDifficulty;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

export function sanitizePlayerName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : "Anonymous";
}

export function loadSavedPlayerName(): string {
  try {
    return sanitizePlayerName(localStorage.getItem(NAME_KEY) ?? "");
  } catch {
    return "Anonymous";
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, sanitizePlayerName(name));
  } catch {
    /* ignore */
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Full UTC datetime to the second, e.g. `2026-07-10T17:32:05Z`. */
export function utcTimestampNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Normalize any parseable date string to UTC second precision with `Z`. */
export function formatUtcTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function validateSummary(summary: RunSummary): void {
  if (!Number.isFinite(summary.seed)) throw new Error("Invalid seed");
  if (!Number.isFinite(summary.floorReached) || summary.floorReached < 1) {
    throw new Error("Invalid floor");
  }
  if (!Number.isFinite(summary.coins) || summary.coins < 0) {
    throw new Error("Invalid coins");
  }
  if (!Number.isFinite(summary.enemiesKilled) || summary.enemiesKilled < 0) {
    throw new Error("Invalid kills");
  }
  if (!Number.isFinite(summary.enemiesKillDifficulty) || summary.enemiesKillDifficulty < 0) {
    throw new Error("Invalid kill difficulty");
  }
  if (!Number.isFinite(summary.durationSec) || summary.durationSec < 0) {
    throw new Error("Invalid duration");
  }
  if (
    summary.floorReached > 500 ||
    summary.coins > 999_999 ||
    summary.enemiesKilled > 99_999 ||
    summary.enemiesKillDifficulty > 9_999_999
  ) {
    throw new Error("Score out of range");
  }
  if (!Array.isArray(summary.itemIds) || summary.itemIds.length > 64) {
    throw new Error("Invalid items");
  }
}

function mergeById(...lists: ScoreEntry[][]): ScoreEntry[] {
  const map = new Map<string, ScoreEntry>();
  for (const list of lists) {
    for (const e of list) map.set(e.id, e);
  }
  return [...map.values()].sort(compareScores);
}

/** Load the committed repo mirror from GitHub raw (or local dev middleware). */
export async function fetchRepoMirror(): Promise<ScoreEntry[]> {
  try {
    const res = await fetchWithTimeout(scoresMirrorUrl(), { cache: "no-cache" });
    if (!res.ok) return [];
    return parseScoreList(await res.json());
  } catch {
    return [];
  }
}

const SCORES_FETCH_MS = 10_000;

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SCORES_FETCH_MS);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** Thrown when the live scores API / mirror cannot be reached in time. */
export class LeaderboardConnectionError extends Error {
  constructor(
    message = "No connection — leaderboard cannot be accessed.",
  ) {
    super(message);
    this.name = "LeaderboardConnectionError";
  }
}

/**
 * Download a full `scores.json` suitable for replacing `data/scores.json` in the repo.
 */
export function downloadScoresMirror(entries: ScoreEntry[]): void {
  const body = `${JSON.stringify(entries.sort(compareScores), null, 2)}\n`;
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = MIRROR_DOWNLOAD_NAME;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Persist a run. Optional remote API when configured; always mirrors to localStorage.
 * Without an API, also downloads an updated `scores.json` to commit into the repo.
 * Pass `asGuest: true` to submit without a Bearer token (white guest name on the board).
 */
export async function submitScore(
  summary: RunSummary,
  playerName: string,
  opts?: { asGuest?: boolean },
): Promise<ScoreEntry> {
  validateSummary(summary);
  const asGuest = opts?.asGuest === true;
  try {
    const session = asGuest ? null : loadAuthSession();
    const api = scoresApiBase();
    const name = sanitizePlayerName(
      api && session ? session.displayName : playerName,
    );
    savePlayerName(name);

    const entry: ScoreEntry = {
      id: newId(),
      playerName: name,
      seed: summary.seed | 0,
      floorReached: Math.floor(summary.floorReached),
      coins: Math.floor(summary.coins),
      enemiesKilled: Math.floor(summary.enemiesKilled),
      enemiesKillDifficulty: Math.floor(summary.enemiesKillDifficulty),
      durationSec: summary.durationSec,
      itemIds: normalizeItemIds(summary.itemIds),
      client: webClientId(),
      userId: session?.userId ?? "",
      createdAt: utcTimestampNow(),
    };

    if (api) {
      const headers = session?.token
        ? authHeaders()
        : { "Content-Type": "application/json" };
      const res = await fetch(`${api}/api/scores`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          playerName: entry.playerName,
          seed: entry.seed,
          floorReached: entry.floorReached,
          coins: entry.coins,
          enemiesKilled: entry.enemiesKilled,
          enemiesKillDifficulty: entry.enemiesKillDifficulty,
          durationSec: entry.durationSec,
          itemIds: entry.itemIds,
          client: entry.client,
        }),
      });
      if (!res.ok) {
        let msg = `Submit failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (typeof body.error === "string" && body.error) msg = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const remote = (await res.json()) as Partial<ScoreEntry>;
      if (typeof remote.id === "string") entry.id = remote.id;
      if (typeof remote.createdAt === "string") {
        entry.createdAt = formatUtcTimestamp(remote.createdAt);
      }
      if (typeof remote.client === "string") {
        entry.client = sanitizeClientId(remote.client) || entry.client;
      }
      if (typeof remote.playerName === "string") {
        entry.playerName = sanitizePlayerName(remote.playerName);
        savePlayerName(entry.playerName);
      }
      if (typeof remote.userId === "string") {
        entry.userId = remote.userId.slice(0, 64);
      }
    }

    const local = readLocal().filter((e) => e.id !== entry.id);
    local.push(entry);
    local.sort(compareScores);
    writeLocal(local);

    if (!api) {
      const mirror = await fetchRepoMirror();
      downloadScoresMirror(mergeById(mirror, local));
    }

    trackProductEvent("score_submit", {
      ok: true,
      as_guest: asGuest,
      seed: summary.seed,
      floor: summary.floorReached,
      coins: summary.coins,
      kills: summary.enemiesKilled,
      kill_difficulty: summary.enemiesKillDifficulty,
      duration_sec: summary.durationSec,
    });
    return entry;
  } catch (err) {
    trackProductEvent("score_submit", {
      ok: false,
      as_guest: asGuest,
      seed: summary.seed,
      floor: summary.floorReached,
      coins: summary.coins,
      kills: summary.enemiesKilled,
      kill_difficulty: summary.enemiesKillDifficulty,
      duration_sec: summary.durationSec,
    });
    throw err;
  }
}

/**
 * Load ranked scores: optional API, else GitHub raw mirror + this browser's localStorage.
 * When the live scores API is configured, throws {@link LeaderboardConnectionError} on timeout / network failure.
 */
export async function listScores(limit = 50): Promise<ScoreEntry[]> {
  const api = scoresApiBase();
  if (api) {
    try {
      const res = await fetchWithTimeout(`${api}/api/scores?limit=${limit}`);
      if (res.ok) {
        const rows = parseScoreList(await res.json()).sort(compareScores);
        return rows.slice(0, limit);
      }
      throw new LeaderboardConnectionError();
    } catch (err) {
      if (err instanceof LeaderboardConnectionError) throw err;
      throw new LeaderboardConnectionError();
    }
  }

  const mirror = await fetchRepoMirror();
  return mergeById(mirror, readLocal()).slice(0, limit);
}

export function usingRemoteScores(): boolean {
  return scoresApiBase() != null;
}

/** True when the shared board is the GitHub raw mirror (no live write API). */
export function usingRepoMirror(): boolean {
  return scoresApiBase() == null;
}
