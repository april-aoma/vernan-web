import { FIXED_DT, FIXED_STEP_HZ } from "../specs";

export type LagPolicy = "timestop_on_lag" | "catch_up" | "nes_slowdown";

export type GameLoopCallbacks = {
  update: (dtSeconds: number) => void;
  render: (renderAlpha: number) => void;
  onFpsUpdate?: (fps: number, ups: number) => void;
  endInputFrameAfterSimBatch?: (ranAnyFixedSteps: boolean, lagSimFrozen: boolean) => void;
  /** Called once when update/render throws; the loop stops scheduling frames. */
  onFatalError?: (err: unknown) => void;
};

/**
 * Fixed-timestep loop driven by requestAnimationFrame.
 * Mirrors game.loop.GameLoop (60 UPS, timestop-on-lag default) without a second sim thread.
 */
export class GameLoop {
  private readonly callbacks: GameLoopCallbacks;
  private readonly lagPolicy: LagPolicy;
  private readonly maxSubsteps: number;
  private running = false;
  private raf = 0;
  private lastMs = 0;
  private accumulator = 0;
  private lagFrozen = false;
  private fpsFrames = 0;
  private upsSteps = 0;
  private fpsWindowStart = 0;

  constructor(callbacks: GameLoopCallbacks, lagPolicy: LagPolicy = "timestop_on_lag") {
    this.callbacks = callbacks;
    this.lagPolicy = lagPolicy;
    this.maxSubsteps = lagPolicy === "nes_slowdown" ? 1 : 30;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    this.fpsWindowStart = this.lastMs;
    this.accumulator = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      try {
        this.frame(now);
      } catch (err) {
        this.running = false;
        this.raf = 0;
        this.callbacks.onFatalError?.(err);
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame(now: number): void {
    let frameSec = (now - this.lastMs) / 1000;
    this.lastMs = now;
    if (frameSec < 0) frameSec = 0;
    if (frameSec > 0.25) frameSec = 0.25;

    if (this.lagPolicy === "timestop_on_lag") {
      if (frameSec >= 0.05) this.lagFrozen = true;
      else if (frameSec <= 0.022) this.lagFrozen = false;
    }

    let ranAny = false;
    if (!this.lagFrozen || this.lagPolicy !== "timestop_on_lag") {
      this.accumulator += frameSec;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < this.maxSubsteps) {
        this.callbacks.update(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
        this.upsSteps++;
        ranAny = true;
      }
      if (steps === this.maxSubsteps) {
        this.accumulator = 0;
      }
    }

    this.callbacks.endInputFrameAfterSimBatch?.(ranAny, this.lagFrozen);
    const alpha = this.lagFrozen ? 0 : Math.min(1, this.accumulator / FIXED_DT);
    this.callbacks.render(alpha);

    this.fpsFrames++;
    if (now - this.fpsWindowStart >= 1000) {
      this.callbacks.onFpsUpdate?.(this.fpsFrames, this.upsSteps);
      this.fpsFrames = 0;
      this.upsSteps = 0;
      this.fpsWindowStart = now;
    }
  }

  get targetUps(): number {
    return FIXED_STEP_HZ;
  }
}
