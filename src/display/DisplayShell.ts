/**
 * Display shell: integer-scales the 512×320 game into a centered play rect and
 * reserves gutters for the virtual controller (portrait bottom / landscape sides).
 *
 * Desktop (page): play capped at Java WINDOW_SCALE (2 → 1024×640); shell hugs
 * game + control gutters instead of filling the monitor.
 * Phone / immersive: shell fills the viewport; play scales down to fit.
 */

import {
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  WINDOW_SCALE,
} from "../specs";

export type ShellRect = { x: number; y: number; w: number; h: number };

export type SafeInsets = { top: number; right: number; bottom: number; left: number };

export type DisplayShellLayout = {
  /** Full shell canvas size (CSS / buffer pixels). */
  shellW: number;
  shellH: number;
  /** Where the 512×320 game blit lands (usually an integer scale; portrait may use 0.5). */
  play: ShellRect;
  /** Scale factor (play.w / 512). */
  playScale: number;
  /** Stick / move cluster region. */
  stickRegion: ShellRect;
  /** Face buttons + shoulders region. */
  faceRegion: ShellRect;
  /** true = landscape side gutters; false = portrait bottom band. */
  landscape: boolean;
  /** Stick on the left (default). Flip later for handedness. */
  stickOnLeft: boolean;
};

export type DisplayShellOptions = {
  /** Default true — stick left / face right (or bottom-left / bottom-right in portrait). */
  stickOnLeft?: boolean;
  /** Minimum side gutter width in landscape (shell px). */
  minSideGutter?: number;
  /** Minimum bottom control band height in portrait (shell px). */
  minBottomBand?: number;
  /** Safe-area insets in shell coordinates. */
  safe?: SafeInsets;
  /**
   * Max integer play scale. Default WINDOW_SCALE (2) = Java display size.
   * Smaller viewports scale down automatically; we never upscale past this.
   */
  maxPlayScale?: number;
  /**
   * `content` — shell hugs game + control chrome (desktop page).
   * `window` — shell fills available viewport (immersive / phone fullscreen).
   */
  fitMode?: "content" | "window";
};

/** Room for ~2× face buttons + flanking shoulders. */
const DEFAULT_MIN_SIDE = 168;
const DEFAULT_MIN_BOTTOM = 12;

/**
 * Pick play blit size. Prefer integer scales (crisp).
 * Portrait immersive may drop to 0.5× when 1× cannot fit (phone width < 512).
 */
function playSize(
  availW: number,
  availH: number,
  maxPlayScale: number,
  allowHalf = false,
): { w: number; h: number; scale: number } {
  const ratio = Math.min(availW / INTERNAL_WIDTH, availH / INTERNAL_HEIGHT);
  const intScale = Math.floor(ratio);
  if (intScale >= 1) {
    const scale = Math.min(maxPlayScale, intScale);
    return {
      w: INTERNAL_WIDTH * scale,
      h: INTERNAL_HEIGHT * scale,
      scale,
    };
  }
  if (allowHalf) {
    // Explicit portrait exception: half Java internal resolution (256×160).
    return {
      w: Math.round(INTERNAL_WIDTH * 0.5),
      h: Math.round(INTERNAL_HEIGHT * 0.5),
      scale: 0.5,
    };
  }
  return {
    w: INTERNAL_WIDTH,
    h: INTERNAL_HEIGHT,
    scale: 1,
  };
}

function centerIn(outer: ShellRect, innerW: number, innerH: number): ShellRect {
  return {
    x: outer.x + Math.floor((outer.w - innerW) / 2),
    y: outer.y + Math.floor((outer.h - innerH) / 2),
    w: innerW,
    h: innerH,
  };
}

function buildLandscape(
  usable: ShellRect,
  shellW: number,
  shellH: number,
  stickOnLeft: boolean,
  minSide: number,
  maxPlayScale: number,
  fitMode: "content" | "window",
): DisplayShellLayout {
  if (fitMode === "content") {
    // Prefer Java-sized play (WINDOW_SCALE), then add control gutters if they fit.
    // Never let gutter mins steal width from play before scale is chosen.
    const fitted = playSize(usable.w, usable.h, maxPlayScale);
    let gutter = minSide;
    if (fitted.w + gutter * 2 > usable.w) {
      gutter = Math.max(0, Math.floor((usable.w - fitted.w) / 2));
    }
    const outW = Math.min(usable.w, fitted.w + gutter * 2);
    const outH = Math.min(usable.h, fitted.h);
    const play: ShellRect = {
      x: Math.floor((outW - fitted.w) / 2),
      y: Math.floor((outH - fitted.h) / 2),
      w: fitted.w,
      h: fitted.h,
    };
    const leftW = play.x;
    const rightX = play.x + play.w;
    const rightW = outW - rightX;
    const stickRegion: ShellRect = stickOnLeft
      ? { x: 0, y: 0, w: Math.max(leftW, 1), h: outH }
      : { x: rightX, y: 0, w: Math.max(rightW, 1), h: outH };
    const faceRegion: ShellRect = stickOnLeft
      ? { x: rightX, y: 0, w: Math.max(rightW, 1), h: outH }
      : { x: 0, y: 0, w: Math.max(leftW, 1), h: outH };
    return {
      shellW: outW,
      shellH: outH,
      play,
      playScale: fitted.scale,
      stickRegion,
      faceRegion,
      landscape: true,
      stickOnLeft,
    };
  }

  // Window fit: fill shell, center integer-scaled play, leftover → gutters.
  // Size play from the full usable rect so large min gutters cannot force 1×.
  const fitted = playSize(usable.w, usable.h, maxPlayScale);
  const play = centerIn(usable, fitted.w, fitted.h);
  const leftW = play.x - usable.x;
  const rightX = play.x + play.w;
  const rightW = usable.x + usable.w - rightX;
  const stickRegion: ShellRect = stickOnLeft
    ? { x: usable.x, y: usable.y, w: leftW, h: usable.h }
    : { x: rightX, y: usable.y, w: rightW, h: usable.h };
  const faceRegion: ShellRect = stickOnLeft
    ? { x: rightX, y: usable.y, w: rightW, h: usable.h }
    : { x: usable.x, y: usable.y, w: leftW, h: usable.h };
  return {
    shellW,
    shellH,
    play,
    playScale: fitted.scale,
    stickRegion,
    faceRegion,
    landscape: true,
    stickOnLeft,
  };
}

function buildPortrait(
  usable: ShellRect,
  shellW: number,
  shellH: number,
  stickOnLeft: boolean,
  minBottom: number,
  maxPlayScale: number,
  fitMode: "content" | "window",
): DisplayShellLayout {
  if (fitMode === "content") {
    const bandH = minBottom;
    const fitted = playSize(usable.w, Math.max(1, usable.h - bandH), maxPlayScale);
    const outW = Math.min(usable.w, fitted.w);
    const outH = Math.min(usable.h, fitted.h + bandH);
    const playFit = playSize(outW, Math.max(1, outH - bandH), maxPlayScale);
    const playAvailH = Math.max(1, outH - bandH);
    const play: ShellRect = {
      x: Math.floor((outW - playFit.w) / 2),
      y: Math.floor((playAvailH - playFit.h) / 2),
      w: playFit.w,
      h: playFit.h,
    };
    const band: ShellRect = { x: 0, y: playAvailH, w: outW, h: outH - playAvailH };
    const halfW = Math.floor(band.w / 2);
    const stickRegion: ShellRect = stickOnLeft
      ? { x: band.x, y: band.y, w: halfW, h: band.h }
      : { x: band.x + halfW, y: band.y, w: band.w - halfW, h: band.h };
    const faceRegion: ShellRect = stickOnLeft
      ? { x: band.x + halfW, y: band.y, w: band.w - halfW, h: band.h }
      : { x: band.x, y: band.y, w: halfW, h: band.h };
    return {
      shellW: outW,
      shellH: outH,
      play,
      playScale: playFit.scale,
      stickRegion,
      faceRegion,
      landscape: false,
      stickOnLeft,
    };
  }

  // Reserve a control band, but never more than leaves room for at least 0.5× play.
  const halfPlayH = Math.round(INTERNAL_HEIGHT * 0.5);
  const bandH = Math.max(
    minBottom,
    Math.min(
      Math.floor(usable.h * 0.36),
      Math.max(minBottom, usable.h - halfPlayH),
    ),
  );
  const playAvail: ShellRect = {
    x: usable.x,
    y: usable.y,
    w: usable.w,
    h: Math.max(1, usable.h - bandH),
  };
  // Portrait immersive: allow 0.5× when the phone is narrower than 512.
  const fitted = playSize(playAvail.w, playAvail.h, maxPlayScale, true);
  const play = centerIn(playAvail, fitted.w, fitted.h);
  const bandY = playAvail.y + playAvail.h;
  const band: ShellRect = {
    x: usable.x,
    y: bandY,
    w: usable.w,
    h: usable.y + usable.h - bandY,
  };
  const halfW = Math.floor(band.w / 2);
  const stickRegion: ShellRect = stickOnLeft
    ? { x: band.x, y: band.y, w: halfW, h: band.h }
    : { x: band.x + halfW, y: band.y, w: band.w - halfW, h: band.h };
  const faceRegion: ShellRect = stickOnLeft
    ? { x: band.x + halfW, y: band.y, w: band.w - halfW, h: band.h }
    : { x: band.x, y: band.y, w: halfW, h: band.h };

  return {
    shellW,
    shellH,
    play,
    playScale: fitted.scale,
    stickRegion,
    faceRegion,
    landscape: false,
    stickOnLeft,
  };
}

/**
 * Compute play + control regions for the available viewport (CSS pixels).
 * Play prefers integer multiples of 512×320 (crisp), capped at Java WINDOW_SCALE.
 * Portrait immersive may use 0.5× when 1× cannot fit.
 */
export function computeDisplayShellLayout(
  availW: number,
  availH: number,
  opts: DisplayShellOptions = {},
): DisplayShellLayout {
  const stickOnLeft = opts.stickOnLeft !== false;
  const minSide = opts.minSideGutter ?? DEFAULT_MIN_SIDE;
  const minBottom = opts.minBottomBand ?? DEFAULT_MIN_BOTTOM;
  const maxPlayScale = Math.max(1, Math.floor(opts.maxPlayScale ?? WINDOW_SCALE));
  const fitMode = opts.fitMode ?? "window";
  const safe = opts.safe ?? { top: 0, right: 0, bottom: 0, left: 0 };

  const shellW = Math.max(1, Math.floor(availW));
  const shellH = Math.max(1, Math.floor(availH));
  const usable: ShellRect = {
    x: Math.max(0, Math.floor(safe.left)),
    y: Math.max(0, Math.floor(safe.top)),
    w: Math.max(1, shellW - Math.floor(safe.left) - Math.floor(safe.right)),
    h: Math.max(1, shellH - Math.floor(safe.top) - Math.floor(safe.bottom)),
  };
  const landscape = usable.w >= usable.h;

  if (landscape) {
    return buildLandscape(usable, shellW, shellH, stickOnLeft, minSide, maxPlayScale, fitMode);
  }
  return buildPortrait(usable, shellW, shellH, stickOnLeft, minBottom, maxPlayScale, fitMode);
}

export function pointInShellRect(x: number, y: number, r: ShellRect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** Map a shell-space point inside play to internal 512×320 coords. */
export function shellPointToInternal(
  sx: number,
  sy: number,
  play: ShellRect,
): { ix: number; iy: number } | null {
  if (!pointInShellRect(sx, sy, play) || play.w <= 0 || play.h <= 0) return null;
  return {
    ix: ((sx - play.x) / play.w) * INTERNAL_WIDTH,
    iy: ((sy - play.y) / play.h) * INTERNAL_HEIGHT,
  };
}
