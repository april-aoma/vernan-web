/**
 * Vernan security signals — rate-limit hits + auth failures (no PII).
 *   POST /api/events
 *
 * Storage: Analytics Engine (`SECURITY` → dataset `vernan_security`).
 *
 * AE column layout:
 *   indexes[0] = event name
 *   blobs[0]   = name
 *   blobs[1]   = service (scores|auth)
 *   blobs[2]   = route
 *   blobs[3]   = reason_code
 *   blobs[4]   = method
 *   doubles[0] = status
 *   doubles[1] = count (usually 1)
 */

import { RateLimiter } from "./rateLimiter";

export { RateLimiter };

export interface Env {
  SECURITY: AnalyticsEngineDataset;
  RATE_LIMITER: DurableObjectNamespace;
}

const ALLOWED_NAMES = new Set(["rate_limit_hit", "auth_failure"]);
const ALLOWED_SERVICES = new Set(["scores", "auth"]);
const ALLOWED_REASONS = new Set([
  "rate_limit",
  "bad_credentials",
  "bad_token",
  "login_required",
  "auth_unconfigured",
]);

const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 120;
const MAX_BATCH = 25;
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
      ...(origin ? corsHeaders(origin) : {}),
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
  const id = env.RATE_LIMITER.idFromName(`security:${ip}`);
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

function sanitizeRoute(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 96);
  if (!s.startsWith("/")) return "";
  return s;
}

function sanitizeMethod(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().toUpperCase().slice(0, 8);
  if (!/^[A-Z]+$/.test(s)) return "";
  return s;
}

function strProp(props: Record<string, unknown>, key: string, max = 32): string {
  const v = props[key];
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function numProp(props: Record<string, unknown>, key: string, fallback = 0): number {
  const v = props[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v;
}

type IncomingEvent = {
  name: string;
  props: Record<string, unknown>;
};

function parseEvent(raw: unknown): IncomingEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!ALLOWED_NAMES.has(name)) return null;
  const props =
    o.props && typeof o.props === "object" && !Array.isArray(o.props)
      ? (o.props as Record<string, unknown>)
      : {};
  const service = strProp(props, "service", 16);
  const reason = strProp(props, "reason_code", 32);
  if (!ALLOWED_SERVICES.has(service) || !ALLOWED_REASONS.has(reason)) return null;
  const route = sanitizeRoute(props.route);
  if (!route) return null;
  return { name, props: { ...props, service, reason_code: reason, route } };
}

function writeEvent(env: Env, ev: IncomingEvent): void {
  const status = Math.floor(numProp(ev.props, "status", 0));
  const count = Math.max(1, Math.floor(numProp(ev.props, "count", 1)));

  env.SECURITY.writeDataPoint({
    indexes: [ev.name.slice(0, 96)],
    blobs: [
      ev.name,
      strProp(ev.props, "service", 16),
      sanitizeRoute(ev.props.route),
      strProp(ev.props, "reason_code", 32),
      sanitizeMethod(ev.props.method) || "POST",
    ],
    doubles: [status, count],
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: origin ? corsHeaders(origin) : undefined,
      });
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
