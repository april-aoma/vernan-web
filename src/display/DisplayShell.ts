/**
 * Display shell: aspect-fits the 512×320 game into a play region and reserves
 * gutters for the virtual controller (portrait bottom / landscape sides).
 */

import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from "../specs";

export type ShellRect = { x: number; y: number; w: number; h: number };

export type DisplayShellLayout = {
  /** Full shell canvas size (CSS / buffer pixels). */
  shellW: number;
  shellH: number;
  /** Where the 512×320 game blit lands. */
  play: ShellRect;
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
};

const DEFAULT_MIN_SIDE = 108;
const DEFAULT_MIN_BOTTOM = 132;
const GAME_ASPECT = INTERNAL_WIDTH / INTERNAL_HEIGHT;

function fitAspect(availW: number, availH: number): { w: number; h: number } {
  let w = Math.max(1, Math.floor(availW));
  let h = Math.max(1, Math.floor(w / GAME_ASPECT));
  if (h > availH) {
    h = Math.max(1, Math.floor(availH));
    w = Math.max(1, Math.floor(h * GAME_ASPECT));
  }
  return { w, h };
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
 * Always reserves control space by shrinking the play area when needed.
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
  const landscape = shellW >= shellH;

  if (landscape) {
    const gutter = Math.max(
      minSide,
      Math.min(Math.floor(shellW * 0.2), Math.floor((shellW - 160) / 2)),
    );
    const playAvail: ShellRect = {
      x: gutter,
      y: 0,
      w: Math.max(1, shellW - gutter * 2),
      h: shellH,
    };
    const fitted = fitAspect(playAvail.w, playAvail.h);
    const play = centerIn(playAvail, fitted.w, fitted.h);
    // Leftover horizontal space outside playAvail stays in gutters; if play is
    // narrower than playAvail, grow gutters equally into the slack.
    const leftW = play.x;
    const rightX = play.x + play.w;
    const rightW = shellW - rightX;
    const stickRegion: ShellRect = stickOnLeft
      ? { x: 0, y: 0, w: leftW, h: shellH }
      : { x: rightX, y: 0, w: rightW, h: shellH };
    const faceRegion: ShellRect = stickOnLeft
      ? { x: rightX, y: 0, w: rightW, h: shellH }
      : { x: 0, y: 0, w: leftW, h: shellH };
    return {
      shellW,
      shellH,
      play,
      stickRegion,
      faceRegion,
      landscape: true,
      stickOnLeft,
    };
  }

  // Portrait: game on top, controls on bottom.
  const bandH = Math.max(
    minBottom,
    Math.min(Math.floor(shellH * 0.34), Math.floor(shellH - 120)),
  );
  const playAvail: ShellRect = {
    x: 0,
    y: 0,
    w: shellW,
    h: Math.max(1, shellH - bandH),
  };
  const fitted = fitAspect(playAvail.w, playAvail.h);
  const play = centerIn(playAvail, fitted.w, fitted.h);
  const bandY = playAvail.y + playAvail.h;
  const band: ShellRect = { x: 0, y: bandY, w: shellW, h: shellH - bandY };
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
