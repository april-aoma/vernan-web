import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
} from "../specs";
import type { ShellRect } from "../display/DisplayShell";

/**
 * Pixel-perfect game backbuffer (512×320) + visible shell canvas.
 * The shell may be larger than the game; present() blits into a play rect.
 */
export class Framebuffer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly internal: HTMLCanvasElement;
  readonly internalCtx: CanvasRenderingContext2D;

  constructor() {
    this.internal = document.createElement("canvas");
    this.internal.width = INTERNAL_WIDTH;
    this.internal.height = INTERNAL_HEIGHT;
    const ictx = this.internal.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ictx) throw new Error("2D context unavailable (internal)");
    this.internalCtx = ictx;
    this.internalCtx.imageSmoothingEnabled = false;

    this.canvas = document.createElement("canvas");
    this.canvas.width = INTERNAL_WIDTH;
    this.canvas.height = INTERNAL_HEIGHT;
    this.setCssSize(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.display = "block";
    this.canvas.style.background = "#000";
    this.canvas.tabIndex = 0;
    this.canvas.style.touchAction = "none";
    this.canvas.style.userSelect = "none";
    (this.canvas.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect =
      "none";

    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D context unavailable (display)");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** CSS display size. */
  setCssSize(widthPx: number, heightPx: number): void {
    this.canvas.style.width = `${Math.max(1, Math.round(widthPx))}px`;
    this.canvas.style.height = `${Math.max(1, Math.round(heightPx))}px`;
  }

  /**
   * Resize the visible shell buffer (and CSS) to match the display shell.
   * Game internal buffer stays 512×320.
   */
  setShellSize(widthPx: number, heightPx: number): void {
    const w = Math.max(1, Math.round(widthPx));
    const h = Math.max(1, Math.round(heightPx));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
    this.setCssSize(w, h);
  }

  clear(fill = "#101418"): void {
    this.internalCtx.fillStyle = fill;
    this.internalCtx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  }

  /**
   * Blit the game backbuffer into the play rect on the shell canvas.
   * Clears the full shell to black first; caller draws virtual controls after.
   */
  present(play?: ShellRect): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.imageSmoothingEnabled = false;
    if (play && play.w > 0 && play.h > 0) {
      this.ctx.drawImage(this.internal, play.x, play.y, play.w, play.h);
    } else {
      this.ctx.drawImage(this.internal, 0, 0, w, h);
    }
  }

  mount(parent: HTMLElement): void {
    parent.replaceChildren(this.canvas);
  }
}
