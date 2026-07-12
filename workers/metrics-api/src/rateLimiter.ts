/**
 * Per-key fixed-window rate limiter (one Durable Object instance per key).
 * POST JSON: { max: number, windowSec: number }
 * → { allowed: boolean, remaining: number }
 */

export class RateLimiter {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    let max = 10;
    let windowSec = 60;
    try {
      const body = (await request.json()) as { max?: unknown; windowSec?: unknown };
      if (typeof body.max === "number" && Number.isFinite(body.max) && body.max > 0) {
        max = Math.floor(body.max);
      }
      if (
        typeof body.windowSec === "number" &&
        Number.isFinite(body.windowSec) &&
        body.windowSec > 0
      ) {
        windowSec = Math.floor(body.windowSec);
      }
    } catch {
      // defaults
    }

    const now = Date.now();
    const stored = await this.state.storage.get<{ count: number; resetAt: number }>("window");
    let count = stored?.count ?? 0;
    let resetAt = stored?.resetAt ?? now + windowSec * 1000;

    if (now >= resetAt) {
      count = 0;
      resetAt = now + windowSec * 1000;
    }

    count += 1;
    await this.state.storage.put("window", { count, resetAt });
    await this.state.storage.setAlarm(resetAt + 60_000);

    const allowed = count <= max;
    return Response.json({
      allowed,
      remaining: Math.max(0, max - count),
      resetAt,
    });
  }

  async alarm(): Promise<void> {
    const stored = await this.state.storage.get<{ resetAt: number }>("window");
    if (!stored || Date.now() >= stored.resetAt) {
      await this.state.storage.deleteAll();
    }
  }
}
