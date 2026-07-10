import type { Aabb } from "../combat/CombatMath";

/** Matches {@link PLATFORM_DECK_SLACK_PX} in Physics / Java RideSurfaces.DECK_SLACK_PX. */
export const DECK_SLACK_PX = 6;

/** Flat deck Y = floor tile top minus this (visible cap, 5 px above sprite bottom). */
export const PEDESTAL_DECK_ABOVE_GROUND_PX = 5;

/** 1 px floor ↔ deck transition at each outer edge of a merged span. */
export const PEDESTAL_EDGE_FEATHER_PX = 1;

const FLOOR_Y_SAMPLES = 4;

export type Segment = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type PedestalSpan = {
  left: number;
  right: number;
  topY: number;
  baseY: number;
  flatLo: number;
  flatHi: number;
  featherPx: number;
};

function segmentYAt(seg: Segment, worldX: number): number {
  const lo = Math.min(seg.x0, seg.x1);
  const hi = Math.max(seg.x0, seg.x1);
  if (worldX < lo - 1e-6 || worldX > hi + 1e-6) return Number.NaN;
  const dx = seg.x1 - seg.x0;
  if (Math.abs(dx) < 1e-9) return Math.min(seg.y0, seg.y1);
  const t = Math.max(0, Math.min(1, (worldX - seg.x0) / dx));
  return seg.y0 + t * (seg.y1 - seg.y0);
}

function pedestalSpanFromBounds(left: number, right: number, topY: number): PedestalSpan {
  const baseY = topY + PEDESTAL_DECK_ABOVE_GROUND_PX;
  const width = Math.max(0, right - left);
  const feather = Math.min(PEDESTAL_EDGE_FEATHER_PX, Math.max(0, width * 0.5 - 1e-3));
  return {
    left,
    right,
    topY,
    baseY,
    flatLo: left + feather,
    flatHi: right - feather,
    featherPx: feather,
  };
}

function spanSurfaceYAt(span: PedestalSpan, x: number): number {
  if (x < span.left - 1e-6 || x > span.right + 1e-6) return Number.NaN;
  if (span.flatHi <= span.flatLo + 1e-3) {
    const t = (x - span.left) / Math.max(1e-9, span.right - span.left);
    return span.baseY + t * (span.topY - span.baseY);
  }
  if (x <= span.flatLo + 1e-6) {
    const t = (x - span.left) / Math.max(1e-9, span.flatLo - span.left);
    return span.baseY + t * (span.topY - span.baseY);
  }
  if (x >= span.flatHi - 1e-6) {
    const t = (span.right - x) / Math.max(1e-9, span.right - span.flatHi);
    return span.baseY + t * (span.topY - span.baseY);
  }
  return span.topY;
}

function spanFloorYUnderSpan(
  span: PedestalSpan,
  feetLeft: number,
  feetRight: number,
  footBottom: number,
): number {
  if (feetRight <= span.left + 1e-6 || feetLeft >= span.right - 1e-6) return Number.NaN;
  if (footBottom >= span.topY - 1e-3) {
    const cx = (feetLeft + feetRight) * 0.5;
    const probeX = Math.max(span.left, Math.min(span.right, cx));
    return spanSurfaceYAt(span, probeX);
  }
  const overlapLo = Math.max(feetLeft, span.left);
  const overlapHi = Math.min(feetRight, span.right);
  let best = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= FLOOR_Y_SAMPLES; i++) {
    const t = i / FLOOR_Y_SAMPLES;
    const sampleX = overlapLo + (overlapHi - overlapLo) * t;
    const y = spanSurfaceYAt(span, sampleX);
    if (!Number.isNaN(y)) best = Math.max(best, y);
  }
  return best > Number.NEGATIVE_INFINITY ? best : Number.NaN;
}

/** Union adjacent deck rects at the same topY into continuous spans. */
export function mergePedestalSpans(decks: Aabb[] | null): PedestalSpan[] {
  if (!decks || decks.length === 0) return [];
  const sorted = decks.filter((d): d is Aabb => d != null).sort((a, b) => a.x - b.x);
  if (sorted.length === 0) return [];
  const out: PedestalSpan[] = [];
  let runLeft = sorted[0]!.x;
  let runRight = sorted[0]!.x + sorted[0]!.w;
  let runTopY = sorted[0]!.y;
  for (let i = 1; i < sorted.length; i++) {
    const deck = sorted[i]!;
    const deckLeft = deck.x;
    const deckRight = deck.x + deck.w;
    const sameHeight = Math.abs(deck.y - runTopY) <= 1e-3;
    const touches = deckLeft <= runRight + 1e-3;
    if (sameHeight && touches) {
      runRight = Math.max(runRight, deckRight);
    } else {
      out.push(pedestalSpanFromBounds(runLeft, runRight, runTopY));
      runLeft = deckLeft;
      runRight = deckRight;
      runTopY = deck.y;
    }
  }
  out.push(pedestalSpanFromBounds(runLeft, runRight, runTopY));
  return out;
}

export function collectPedestalSegments(pedestalDecks: Aabb[] | null): Segment[] {
  const out: Segment[] = [];
  for (const span of mergePedestalSpans(pedestalDecks)) {
    if (span.flatHi <= span.flatLo + 1e-3) {
      out.push({ x0: span.left, y0: span.baseY, x1: span.right, y1: span.topY });
      continue;
    }
    out.push({ x0: span.left, y0: span.baseY, x1: span.flatLo, y1: span.topY });
    out.push({ x0: span.flatLo, y0: span.topY, x1: span.flatHi, y1: span.topY });
    out.push({ x0: span.flatHi, y0: span.topY, x1: span.right, y1: span.baseY });
  }
  return out;
}

export function footNearDeck(footY: number, deckY: number): boolean {
  if (Number.isNaN(deckY)) return false;
  return footY >= deckY - 1e-3 && footY <= deckY + DECK_SLACK_PX;
}

export function floorYUnderFeet(
  feetLeft: number,
  feetRight: number,
  footBottom: number,
  segments: Segment[],
  pedestalDecks: Aabb[] | null,
): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const span of mergePedestalSpans(pedestalDecks)) {
    const y = spanFloorYUnderSpan(span, feetLeft, feetRight, footBottom);
    if (!Number.isNaN(y)) best = Math.max(best, y);
  }
  if (best > Number.NEGATIVE_INFINITY) return best;
  for (const seg of segments) {
    const yLo = segmentYAt(seg, feetLeft);
    const yHi = segmentYAt(seg, feetRight);
    if (!Number.isNaN(yLo)) best = Math.max(best, yLo);
    if (!Number.isNaN(yHi)) best = Math.max(best, yHi);
  }
  return best > Number.NEGATIVE_INFINITY ? best : Number.NaN;
}

export function landingPedestalFloorY(
  prevFootY: number,
  nextFootY: number,
  feetLeft: number,
  feetRight: number,
  vy: number,
  pedestalDecks: Aabb[] | null,
): number {
  if (!pedestalDecks || (vy < 0 && nextFootY <= prevFootY + 1e-3)) return Number.NaN;
  let best = Number.POSITIVE_INFINITY;
  for (const span of mergePedestalSpans(pedestalDecks)) {
    if (feetRight <= span.left + 1e-6 || feetLeft >= span.right - 1e-6) continue;
    const support = spanFloorYUnderSpan(span, feetLeft, feetRight, nextFootY);
    if (Number.isNaN(support)) continue;
    if (footNearDeck(nextFootY, support) && vy >= 0) {
      if (footNearDeck(prevFootY, support) || prevFootY >= support - 1e-3) {
        best = Math.min(best, support);
        continue;
      }
    }
    const segLo = Math.min(prevFootY, nextFootY);
    const segHi = Math.max(prevFootY, nextFootY);
    const crossed =
      segLo <= support + 1e-3 &&
      segHi >= support - DECK_SLACK_PX &&
      nextFootY >= support - 1e-3 &&
      nextFootY <= support + DECK_SLACK_PX;
    if (vy >= 0 && crossed) best = Math.min(best, support);
  }
  return best < Number.POSITIVE_INFINITY ? best : Number.NaN;
}

export function isGroundedUnderFeet(
  feetLeft: number,
  feetRight: number,
  footBottom: number,
  vy: number,
  segments: Segment[],
  pedestalDecks: Aabb[] | null,
): boolean {
  if (vy < 0) return false;
  const deck = floorYUnderFeet(feetLeft, feetRight, footBottom, segments, pedestalDecks);
  return footNearDeck(footBottom, deck);
}

export function feetOverlapPedestalHull(
  feetLeft: number,
  feetRight: number,
  pedestalDecks: Aabb[] | null,
): boolean {
  for (const span of mergePedestalSpans(pedestalDecks)) {
    if (feetRight > span.left + 1e-6 && feetLeft < span.right - 1e-6) return true;
  }
  return false;
}
