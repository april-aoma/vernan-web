/**
 * Display shell: integer-scales the 512×320 game into a centered play rect and
 * reserves gutters for the virtual controller (portrait bottom / landscape sides).
 */

import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from "../specs";

export type ShellRect = { x: number; y: number; w: number; h: number };

export type SafeInsets = { top: number; right: number; bottom: number; left: number };

export type DisplayShellLayout = {
  /** Full shell canvas size (CSS / buffer pixels). */
  shellW: number;
  shellH: number;
  /** Where the 512×320 game blit lands (integer multiple of internal size). */
  play: ShellRect;
  /** Integer scale factor (play.w / 512). */
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
  /** Safe-area insets already applied to the shell coordinate space (usually 0 if CSS pads). */
  safe?: SafeInsets;
};

/** Room for ~2× face buttons + flanking shoulders. */
const DEFAULT_MIN_SIDE = 168;
const DEFAULT_MIN_BOTTOM = 200;

function integerPlaySize(availW: number, availH: number): {
  w: number;
  h: number;
  scale: number;
} {
  const scale = Math.max(
    1,
    Math.floor(Math.min(availW / INTERNAL_WIDTH, availH / INTERNAL_HEIGHT)),
  );
  return {
    w: INTERNAL_WIDTH * scale,
    h: INTERNAL_HEIGHT * scale,
    scale,
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

/**
 * Compute play + control regions for the available viewport (CSS pixels).
 * Play size is always an integer multiple of 512×320 for crisp pixels.
 */
export function computeDisplayShellLayout(
  availW: number,
  availH: number,
  opts: DisplayShellOptions = {},
): DisplayShellLayout {
  const shellW = Math.max(1, Math.floor(availW));
  const shellH = Math.max(1, Math.floor(availH));
  const stickOnLeft = opts.stickOnLeft !== false;
  const minSide = opts.minSideGutter ?? DEFAULT_MIN_SIDE;
  const minBottom = opts.minBottomBand ?? DEFAULT_MIN_BOTTOM;
  const safe = opts.safe ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const usable: ShellRect = {
    x: Math.max(0, Math.floor(safe.left)),
    y: Math.max(0, Math.floor(safe.top)),
    w: Math.max(1, shellW - Math.floor(safe.left) - Math.floor(safe.right)),
    h: Math.max(1, shellH - Math.floor(safe.top) - Math.floor(safe.bottom)),
  };
  const landscape = usable.w >= usable.h;

  if (landscape) {
    // Reserve side gutters, then integer-fit and center play in the full usable area
    // so leftover vertical space is symmetric (true visual centering).
    const gutter = Math.max(
      minSide,
      Math.min(Math.floor(usable.w * 0.22), Math.floor((usable.w - INTERNAL_WIDTH) / 2)),
    );
    const playAvailW = Math.max(1, usable.w - gutter * 2);
    const fitted = integerPlaySize(playAvailW, usable.h);
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

  // Portrait: game on top (integer-scaled + centered), controls on bottom.
  const bandH = Math.max(
    minBottom,
    Math.min(Math.floor(usable.h * 0.36), Math.floor(usable.h - INTERNAL_HEIGHT)),
  );
  const playAvail: ShellRect = {
    x: usable.x,
    y: usable.y,
    w: usable.w,
    h: Math.max(1, usable.h - bandH),
  };
  const fitted = integerPlaySize(playAvail.w, playAvail.h);
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
