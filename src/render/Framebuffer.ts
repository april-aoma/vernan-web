import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
} from "../specs";

/**
 * Pixel-perfect framebuffer: 512×320 internal → 1024×640 CSS (WINDOW_SCALE 2).
 * Replaces Swing JPanel + BufferedImage backbuffer.
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
    const ictx = this.internal.getContext("2d", { alpha: false });
    if (!ictx) throw new Error("2D context unavailable (internal)");
    this.internalCtx = ictx;
    this.internalCtx.imageSmoothingEnabled = false;

    this.canvas = document.createElement("canvas");
    this.canvas.width = INTERNAL_WIDTH;
    this.canvas.height = INTERNAL_HEIGHT;
    this.canvas.style.width = `${DISPLAY_WIDTH}px`;
    this.canvas.style.height = `${DISPLAY_HEIGHT}px`;
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.display = "block";
    this.canvas.style.background = "#000";
    this.canvas.tabIndex = 0;

    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D context unavailable (display)");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(fill = "#101418"): void {
    this.internalCtx.fillStyle = fill;
    this.internalCtx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  }

  /** Blit internal buffer to the visible canvas (1:1 pixels; CSS scales to 1024×640). */
  present(): void {
    this.ctx.drawImage(this.internal, 0, 0);
  }

  mount(parent: HTMLElement): void {
    parent.replaceChildren(this.canvas);
  }
}
