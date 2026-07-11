import { webClientId } from "../ranking/clientVersion";

export type CrashSource =
  | "window.error"
  | "unhandledrejection"
  | "gameloop"
  | "boot"
  | "manual";

export type CrashContext = {
  seed?: number | null;
  floorReached?: number | null;
};

export type CrashReportInput = {
  message: string;
  stack?: string;
  source: CrashSource | string;
};

type CrashPayload = {
  message: string;
  stack: string;
  source: string;
  pageUrl: string;
  client: string;
  seed: number | null;
  floorReached: number | null;
  userAgent: string;
};

const DEDUPE_MS = 15_000;
let context: CrashContext = {};
let lastFingerprint = "";
let lastSentAt = 0;
let installed = false;

/** Same live API host as scores (`?scoresApi=` / `VITE_SCORES_API`). */
function liveApiBase(): string | null {
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

export function setCrashContext(next: CrashContext): void {
  context = { ...context, ...next };
}

function fingerprint(message: string, stack: string, source: string): string {
  return `${source}|${message}|${stack.slice(0, 200)}`;
}

function normalizeError(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) {
    return {
      message: err.message || err.name || "Error",
      stack: typeof err.stack === "string" ? err.stack : "",
    };
  }
  if (typeof err === "string") {
    return { message: err, stack: "" };
  }
  try {
    return { message: JSON.stringify(err), stack: "" };
  } catch {
    return { message: String(err), stack: "" };
  }
}

function buildPayload(input: CrashReportInput): CrashPayload {
  const message = input.message.trim().slice(0, 500) || "Unknown error";
  return {
    message,
    stack: (input.stack ?? "").slice(0, 8000),
    source: String(input.source || "unknown").slice(0, 64),
    pageUrl: typeof window !== "undefined" ? window.location.href.slice(0, 500) : "",
    client: webClientId(),
    seed:
      typeof context.seed === "number" && Number.isFinite(context.seed)
        ? context.seed | 0
        : null,
    floorReached:
      typeof context.floorReached === "number" && Number.isFinite(context.floorReached)
        ? Math.floor(context.floorReached)
        : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
  };
}

/**
 * Fire-and-forget crash report to the Cloudflare Worker.
 * No-ops when the live API is not configured.
 */
export function reportCrash(input: CrashReportInput): void {
  void submitCrashReport(input);
}

/**
 * Send a crash report and resolve with whether the API accepted it.
 * Manual reports skip the short dedupe window.
 */
export async function submitCrashReport(input: CrashReportInput): Promise<boolean> {
  const api = liveApiBase();
  if (!api) return false;

  const payload = buildPayload(input);
  const skipDedupe = payload.source === "manual";
  const fp = fingerprint(payload.message, payload.stack, payload.source);
  const now = Date.now();
  if (!skipDedupe && fp === lastFingerprint && now - lastSentAt < DEDUPE_MS) {
    return false;
  }
  lastFingerprint = fp;
  lastSentAt = now;

  try {
    const res = await fetch(`${api}/api/crashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function reportUnknownCrash(err: unknown, source: CrashSource | string): void {
  const { message, stack } = normalizeError(err);
  reportCrash({ message, stack, source });
}

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

function isCrashEntry(v: unknown): v is CrashEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.message === "string" &&
    typeof o.stack === "string" &&
    typeof o.source === "string" &&
    typeof o.createdAt === "string"
  );
}

/** Load recent crash reports from the live API (viewer page). */
export async function listCrashes(limit = 50): Promise<CrashEntry[]> {
  const api = liveApiBase();
  if (!api) {
    throw new Error("Crash reports API is not configured.");
  }
  const res = await fetch(`${api}/api/crashes?limit=${limit}`, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load crashes (${res.status})`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data.filter(isCrashEntry);
}

/** Install global window error handlers once (call before mount). */
export function installCrashHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (ev) => {
    const err = ev.error;
    if (err instanceof Error) {
      reportUnknownCrash(err, "window.error");
      return;
    }
    const message =
      typeof ev.message === "string" && ev.message
        ? ev.message
        : "Uncaught error";
    const where =
      typeof ev.filename === "string" && ev.filename
        ? `\n${ev.filename}:${ev.lineno}:${ev.colno}`
        : "";
    reportCrash({
      message,
      stack: where,
      source: "window.error",
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    reportUnknownCrash(ev.reason, "unhandledrejection");
  });
}
