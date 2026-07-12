/**
 * Vernan client-health API for the static game client.
 *   POST /api/events
 *
 * Storage: Workers Analytics Engine (`HEALTH` → dataset `vernan_client_health`).
 *
 * AE column layout:
 *   indexes[0] = event name
 *   blobs[0]   = name
 *   blobs[1]   = sessionId
 *   blobs[2]   = client
 *   blobs[3]   = path / phase / ""
 *   blobs[4]   = kind (image|json|text|"")
 *   doubles[0] = duration_ms
 *   doubles[1] = fps
 *   doubles[2] = ups
 *   doubles[3] = ok (1/0)
 *   doubles[4] = http_status
 *   doubles[5] = seed
 *   doubles[6] = floor
 */

import { RateLimiter } from "./rateLimiter";

export { RateLimiter };

export interface Env {
  HEALTH: AnalyticsEngineDataset;
  RATE_LIMITER: DurableObjectNamespace;
}

const ALLOWED_NAMES = new Set(["boot_timing", "asset_load_fail", "perf_signal"]);

const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 40;
const MAX_BATCH = 20;
const MAX_BODY_BYTES = 16_384;

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
  "http://localhost:8789",
  "http://127.0.0.1:8789",
  "http://localhost:8790",
  "http://127.0.0.1:8790",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://april-aoma.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

async function rateLimited(env: Env, ip: string): Promise<boolean> {
  const id = env.RATE_LIMITER.idFromName(`health:${ip}`);
  const stub = env.RATE_LIMITER.get(id);
  const res = await stub.fetch("https://rate-limiter/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max: RATE_LIMIT_MAX, windowSec: RATE_LIMIT_WINDOW_SEC }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { allowed?: boolean };
  return data.allowed !== true;
}

function sanitizeClient(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 32);
  if (/^(web|desktop)_0\.\d+\.\d+$/.test(s)) return s;
  return "";
}

function sanitizeSessionId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 64);
  if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
  return "";
}

function sanitizePath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\0/g, "").trim().slice(0, 96);
}

function numProp(props: Record<string, unknown>, key: string, fallback = 0): number {
  const v = props[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v;
}

function strProp(props: Record<string, unknown>, key: string, max = 32): string {
  const v = props[key];
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function bool01(v: unknown): number {
  return v === true || v === 1 || v === "1" ? 1 : 0;
}

type IncomingEvent = {
  name: string;
  sessionId: string;
  client: string;
  props: Record<string, unknown>;
};

function parseEvent(raw: unknown): IncomingEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!ALLOWED_NAMES.has(name)) return null;
  const sessionId = sanitizeSessionId(o.sessionId);
  if (!sessionId) return null;
  const props =
    o.props && typeof o.props === "object" && !Array.isArray(o.props)
      ? (o.props as Record<string, unknown>)
      : {};
  return {
    name,
    sessionId,
    client: sanitizeClient(o.client),
    props,
  };
}

function writeEvent(env: Env, ev: IncomingEvent): void {
  const pathOrPhase =
    sanitizePath(ev.props.path) ||
    strProp(ev.props, "phase", 48) ||
    strProp(ev.props, "error_class", 48);
  const kind = strProp(ev.props, "kind", 16);
  const duration = Math.max(0, numProp(ev.props, "duration_ms", 0));
  const fps = Math.max(0, numProp(ev.props, "fps", 0));
  const ups = Math.max(0, numProp(ev.props, "ups", 0));
  const ok = ev.name === "boot_timing" ? bool01(ev.props.ok ?? ev.props.success) : 1;
  const httpStatus = Math.max(0, Math.floor(numProp(ev.props, "http_status", 0)));
  const seed = Math.floor(numProp(ev.props, "seed", 0));
  const floor = Math.floor(numProp(ev.props, "floor", numProp(ev.props, "floorReached", 0)));

  env.HEALTH.writeDataPoint({
    indexes: [ev.name.slice(0, 96)],
    blobs: [ev.name, ev.sessionId, ev.client, pathOrPhase, kind],
    doubles: [duration, fps, ups, ok, httpStatus, seed, floor],
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname !== "/api/events") {
      return json({ error: "Not found" }, 404, origin);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, origin);
    }

    const len = Number(request.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return json({ error: "Body too large" }, 413, origin);
    }

    if (await rateLimited(env, clientIp(request))) {
      return json({ error: "Rate limit exceeded" }, 429, origin);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, origin);
    }

    const rawEvents = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)
        ? (body as { events: unknown[] }).events
        : [body];

    if (rawEvents.length === 0 || rawEvents.length > MAX_BATCH) {
      return json({ error: "Invalid batch size" }, 400, origin);
    }

    let accepted = 0;
    for (const raw of rawEvents) {
      const ev = parseEvent(raw);
      if (!ev) continue;
      writeEvent(env, ev);
      accepted += 1;
    }

    if (accepted === 0) {
      return json({ error: "No valid events" }, 400, origin);
    }

    return json({ ok: true, accepted }, 200, origin);
  },
};
