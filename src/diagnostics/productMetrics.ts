/**
 * Product / gameplay metrics — fire-and-forget to vernan-metrics Worker.
 * Never sends passwords, JWTs, usernames, or display names.
 */

import { webClientId } from "../ranking/clientVersion";

export type ProductEventName =
  | "run_start"
  | "floor_reached"
  | "run_death"
  | "run_retry"
  | "run_restart"
  | "score_submit"
  | "auth";

export type ProductEventProps = Record<string, string | number | boolean | null | undefined>;

const SESSION_KEY = "vernan-metrics-sid";
const AUTH_STORAGE_KEY = "vernan-web-auth";
const DEFAULT_LIVE_API = "https://vernan-metrics.henrysbasu.workers.dev";

function metricsApiBase(): string {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("metricsApi");
    if (fromQuery) return fromQuery.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  const fromEnv = import.meta.env.VITE_METRICS_API;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return DEFAULT_LIVE_API;
}

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing && /^[a-zA-Z0-9_-]+$/.test(existing)) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "")
        : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `s${Date.now().toString(36)}`;
  }
}

/** Read opaque userId without importing authStore (avoids a circular dep). */
function authFields(): { loggedIn: boolean; userId?: string } {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { loggedIn: false };
    const parsed = JSON.parse(raw) as { userId?: unknown };
    if (typeof parsed.userId === "string" && parsed.userId) {
      return { loggedIn: true, userId: parsed.userId.slice(0, 64) };
    }
  } catch {
    /* ignore */
  }
  return { loggedIn: false };
}

/**
 * Emit a product event. Failures are swallowed — never block gameplay.
 */
export function trackProductEvent(name: ProductEventName, props: ProductEventProps = {}): void {
  if (typeof window === "undefined") return;
  const api = metricsApiBase();
  if (!api) return;

  const { loggedIn, userId } = authFields();
  const cleanProps: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    cleanProps[k] = v;
  }

  const payload = {
    name,
    ts: Date.now(),
    sessionId: sessionId(),
    client: webClientId(),
    loggedIn,
    ...(userId ? { userId } : {}),
    props: cleanProps,
  };

  const body = JSON.stringify(payload);
  const url = `${api}/api/events`;

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}
