/**
 * Client health telemetry — fire-and-forget to vernan-client-health Worker.
 * boot_timing, asset_load_fail, perf_signal. Never sends PII.
 */

import { webClientId } from "../ranking/clientVersion";

export type HealthEventName = "boot_timing" | "asset_load_fail" | "perf_signal";

export type HealthEventProps = Record<string, string | number | boolean | null | undefined>;

const SESSION_KEY = "vernan-health-sid";
const DEFAULT_LIVE_API = "https://vernan-client-health.henrysbasu.workers.dev";
const PERF_COOLDOWN_MS = 60_000;
const ASSET_FAIL_CAP = 40;

const reportedAssetFails = new Set<string>();
let lastPerfEmitAt = 0;

function healthApiBase(): string {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("healthApi");
    if (fromQuery) return fromQuery.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  const fromEnv = import.meta.env.VITE_CLIENT_HEALTH_API;
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
        : `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `h${Date.now().toString(36)}`;
  }
}

export function trackHealthEvent(name: HealthEventName, props: HealthEventProps = {}): void {
  if (typeof window === "undefined") return;
  const api = healthApiBase();
  if (!api) return;

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
    /* fall through */
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

/** Deduped asset failure (one event per path per page session, capped). */
export function trackAssetLoadFail(
  path: string,
  opts?: { kind?: "image" | "json" | "text"; http_status?: number },
): void {
  const key = path.slice(0, 96);
  if (reportedAssetFails.has(key)) return;
  if (reportedAssetFails.size >= ASSET_FAIL_CAP) return;
  reportedAssetFails.add(key);
  trackHealthEvent("asset_load_fail", {
    path: key,
    kind: opts?.kind ?? "image",
    http_status: opts?.http_status ?? 0,
  });
}

/** Rare FPS drop signal — at most once per minute. */
export function trackPerfSignalIfNeeded(
  fps: number,
  ups: number,
  ctx: { seed?: number; floor?: number },
): void {
  if (fps >= 45) return;
  const now = Date.now();
  if (now - lastPerfEmitAt < PERF_COOLDOWN_MS) return;
  lastPerfEmitAt = now;
  trackHealthEvent("perf_signal", {
    fps,
    ups,
    seed: ctx.seed ?? 0,
    floor: ctx.floor ?? 0,
  });
}
