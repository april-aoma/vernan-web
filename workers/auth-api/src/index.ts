/**
 * Vernan auth API (separate from the leaderboard / scores worker).
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   GET  /api/auth/me
 *   POST /api/auth/logout
 *
 * Accounts remain in AUTH KV. Rate limits use a Durable Object.
 */

import {
  authenticateUser,
  createUser,
  requireAuth,
  sanitizeDisplayName,
  signJwt,
  validatePassword,
  validateUsername,
  type AuthUser,
} from "./auth";
import { RateLimiter } from "./rateLimiter";
import { peekErrorMessage, reportRequestTelemetry } from "./telemetry";

export { RateLimiter };

export interface Env {
  AUTH: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  /** HMAC secret for JWTs — must match vernan-scores. */
  AUTH_SECRET: string;
  /** Optional service binding to vernan-api-ops. */
  API_OPS?: Fetcher;
  /** Optional service binding to vernan-security. */
  SECURITY?: Fetcher;
}

const RATE_LIMIT_WINDOW_SEC = 60;
const AUTH_RATE_LIMIT_MAX = 20;

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

async function rateLimited(env: Env, ip: string): Promise<boolean> {
  const id = env.RATE_LIMITER.idFromName(`rl:auth:${ip}`);
  const stub = env.RATE_LIMITER.get(id);
  const res = await stub.fetch("https://rate-limiter/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max: AUTH_RATE_LIMIT_MAX, windowSec: RATE_LIMIT_WINDOW_SEC }),
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

function authResponse(user: AuthUser, token: string) {
  return { token, userId: user.id, username: user.username, displayName: user.displayName };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const t0 = Date.now();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const response = await handleAuth(request, env, origin, url);
    const errorMessage = await peekErrorMessage(response);
    ctx.waitUntil(
      reportRequestTelemetry(env, {
        service: "auth",
        route: url.pathname,
        method: request.method,
        status: response.status,
        latency_ms: Date.now() - t0,
        errorMessage,
      }),
    );
    return response;
  },
};

async function handleAuth(
  request: Request,
  env: Env,
  origin: string | null,
  url: URL,
): Promise<Response> {
    if (!url.pathname.startsWith("/api/auth/")) {
      return json({ error: "Not found" }, 404, origin);
    }

    if (!env.AUTH_SECRET) {
      return json({ error: "Auth not configured" }, 503, origin);
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const auth = await requireAuth(request, env.AUTH_SECRET);
      if ("error" in auth) return json({ error: auth.error }, auth.status, origin);
      return json(
        {
          userId: auth.user.id,
          username: auth.user.username,
          displayName: auth.user.displayName,
        },
        200,
        origin,
      );
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      // JWT is client-held; logout is a no-op for the server.
      return json({ ok: true }, 200, origin);
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      if (await rateLimited(env, clientIp(request))) {
        return json({ error: "Too many requests" }, 429, origin);
      }
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON" }, 400, origin);
      }
      let username: string;
      let password: string;
      try {
        username = validateUsername(body.username);
        password = validatePassword(body.password);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid credentials";
        return json({ error: msg }, 400, origin);
      }
      const displayName = sanitizeDisplayName(body.displayName ?? username);
      try {
        const user = await createUser(env.AUTH, username, password, displayName);
        const token = await signJwt(user, env.AUTH_SECRET);
        return json(authResponse(user, token), 201, origin);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Register failed";
        const status = msg === "Username already taken" ? 409 : 500;
        return json({ error: msg }, status, origin);
      }
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      if (await rateLimited(env, clientIp(request))) {
        return json({ error: "Too many requests" }, 429, origin);
      }
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON" }, 400, origin);
      }
      let username: string;
      let password: string;
      try {
        username = validateUsername(body.username);
        password = validatePassword(body.password);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid credentials";
        return json({ error: msg }, 400, origin);
      }
      const user = await authenticateUser(env.AUTH, username, password);
      if (!user) {
        return json({ error: "Invalid username or password" }, 401, origin);
      }
      const token = await signJwt(user, env.AUTH_SECRET);
      return json(authResponse(user, token), 200, origin);
    }

    return json({ error: "Not found" }, 404, origin);
}
