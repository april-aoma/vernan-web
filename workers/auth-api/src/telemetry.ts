/**
 * Fire-and-forget ops + security telemetry to sibling Workers.
 * Never include passwords, JWTs, usernames, or display names.
 */

export type TelemetryService = "scores" | "auth";

export type AuthFailureReason =
  | "bad_credentials"
  | "bad_token"
  | "login_required"
  | "auth_unconfigured";

export type TelemetryEnv = {
  API_OPS?: Fetcher;
  SECURITY?: Fetcher;
};

const OPS_FALLBACK = "https://vernan-api-ops.henrysbasu.workers.dev";
const SECURITY_FALLBACK = "https://vernan-security.henrysbasu.workers.dev";

async function postEvent(
  fetcher: Fetcher | undefined,
  fallbackUrl: string,
  payload: unknown,
): Promise<void> {
  const body = JSON.stringify(payload);
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  };
  try {
    if (fetcher) {
      await fetcher.fetch("https://telemetry/api/events", init);
      return;
    }
    await fetch(`${fallbackUrl}/api/events`, init);
  } catch {
    /* never fail the main request */
  }
}

export function emitApiRequest(
  env: TelemetryEnv,
  meta: {
    service: TelemetryService;
    route: string;
    method: string;
    status: number;
    latency_ms: number;
  },
): Promise<void> {
  return postEvent(env.API_OPS, OPS_FALLBACK, {
    name: "api_request",
    props: {
      service: meta.service,
      route: meta.route,
      method: meta.method,
      status: meta.status,
      latency_ms: meta.latency_ms,
    },
  });
}

export function emitRateLimitHit(
  env: TelemetryEnv,
  meta: { service: TelemetryService; route: string; method: string },
): Promise<void> {
  return postEvent(env.SECURITY, SECURITY_FALLBACK, {
    name: "rate_limit_hit",
    props: {
      service: meta.service,
      route: meta.route,
      method: meta.method,
      reason_code: "rate_limit",
      status: 429,
      count: 1,
    },
  });
}

export function emitAuthFailure(
  env: TelemetryEnv,
  meta: {
    service: TelemetryService;
    route: string;
    method: string;
    reason_code: AuthFailureReason;
    status: number;
  },
): Promise<void> {
  return postEvent(env.SECURITY, SECURITY_FALLBACK, {
    name: "auth_failure",
    props: {
      service: meta.service,
      route: meta.route,
      method: meta.method,
      reason_code: meta.reason_code,
      status: meta.status,
      count: 1,
    },
  });
}

export function authFailureReason(error: string): AuthFailureReason | null {
  if (error === "Invalid username or password") return "bad_credentials";
  if (error === "Invalid or expired token") return "bad_token";
  if (error === "Login required") return "login_required";
  if (error === "Auth not configured") return "auth_unconfigured";
  return null;
}

export async function reportRequestTelemetry(
  env: TelemetryEnv,
  meta: {
    service: TelemetryService;
    route: string;
    method: string;
    status: number;
    latency_ms: number;
    errorMessage?: string;
  },
): Promise<void> {
  const tasks: Promise<void>[] = [
    emitApiRequest(env, {
      service: meta.service,
      route: meta.route,
      method: meta.method,
      status: meta.status,
      latency_ms: meta.latency_ms,
    }),
  ];

  if (meta.status === 429) {
    tasks.push(
      emitRateLimitHit(env, {
        service: meta.service,
        route: meta.route,
        method: meta.method,
      }),
    );
  } else if (meta.errorMessage) {
    const reason = authFailureReason(meta.errorMessage);
    if (reason) {
      tasks.push(
        emitAuthFailure(env, {
          service: meta.service,
          route: meta.route,
          method: meta.method,
          reason_code: reason,
          status: meta.status,
        }),
      );
    }
  }

  await Promise.all(tasks);
}

export async function peekErrorMessage(response: Response): Promise<string | undefined> {
  if (response.status < 400) return undefined;
  try {
    const clone = response.clone();
    const data = (await clone.json()) as { error?: unknown };
    return typeof data.error === "string" ? data.error : undefined;
  } catch {
    return undefined;
  }
}
