import type { Aabb } from "../combat/CombatMath";
import { deckUnderFootX as iceDeckUnderFootX } from "../combat/IceBlockSupport";
import type { IceBlock } from "./IceBlock";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import type { CombatEnemy } from "./CombatEnemy";
import { isPeerWalkingEnemy, type PeerWalkingEnemy } from "./PeerWalkingEnemy";

/** Feet within this distance of a peer hull top count as standing / landing. */
export const PEER_STAND_EPS_PX = 3.0;
const MIN_STACK_OVERLAP_PX = 0.25;
const FOOT_AHEAD_PROBE_DROP_PX = 1.0;

let tickIce: readonly IceBlock[] = [];

/** Per-tick ice decks / solids ({@link setTickIceBlocks} from mount before enemy updates). */
export function setTickIceBlocks(blocks: readonly IceBlock[] | null | undefined): void {
  tickIce = blocks ?? [];
}

export function tickIceBlocks(): readonly IceBlock[] {
  return tickIce;
}

function rectLeft(r: Aabb): number {
  return r.x;
}
function rectRight(r: Aabb): number {
  return r.x + r.w;
}
function rectTop(r: Aabb): number {
  return r.y;
}
function rectBottom(r: Aabb): number {
  return r.y + r.h;
}

export function horizontalOverlap(a: Aabb, b: Aabb): boolean {
  return rectRight(a) > rectLeft(b) + 1e-3 && rectLeft(a) < rectRight(b) - 1e-3;
}

export function canSupport(e: CombatEnemy): boolean {
  if (!isPeerWalkingEnemy(e)) return false;
  return (
    !e.isDead() &&
    !e.isKuriboStompCorpseActive() &&
    e.canServeAsPeerPlatform()
  );
}

/** Highest peer/ice hull top the entity may land on this step, or NaN if none. */
export function landingSurfaceY(
  self: CombatEnemy,
  peers: readonly CombatEnemy[],
  prevBottom: number,
): number {
  const r = self.rect();
  const nextBottom = rectBottom(r);
  let bestTop = NaN;
  for (const other of peers) {
    if (other === self || !canSupport(other)) continue;
    const ob = other.rect();
    if (!horizontalOverlap(r, ob)) continue;
    const top = rectTop(ob);
    const crossedFromAbove = prevBottom <= top + 1e-3;
    if (crossedFromAbove && nextBottom >= top - PEER_STAND_EPS_PX) {
      if (Number.isNaN(bestTop) || top > bestTop) bestTop = top;
    }
  }
  for (const iceBlock of tickIce) {
    const ob = iceBlock.rect();
    if (!horizontalOverlap(r, ob)) continue;
    const top = iceBlock.deckTopY();
    // Already embedded in the ice hull (e.g. spawn overlap) — do not snap feet to the deck.
    if (prevBottom > top + PEER_STAND_EPS_PX + 1e-3) continue;
    const crossedFromAbove = prevBottom <= top + 1e-3;
    if (crossedFromAbove && nextBottom >= top - PEER_STAND_EPS_PX) {
      if (Number.isNaN(bestTop) || top > bestTop) bestTop = top;
    }
  }
  return bestTop;
}

export function isStandingOnPeer(
  self: CombatEnemy,
  peers: readonly CombatEnemy[],
): boolean {
  if (!isPeerWalkingEnemy(self) || self.vy < 0) return false;
  const r = self.rect();
  for (const other of peers) {
    if (other === self || !canSupport(other)) continue;
    const ob = other.rect();
    if (!horizontalOverlap(r, ob)) continue;
    if (Math.abs(rectBottom(r) - rectTop(ob)) <= PEER_STAND_EPS_PX) return true;
  }
  for (const iceBlock of tickIce) {
    const ob = iceBlock.rect();
    if (!horizontalOverlap(r, ob)) continue;
    if (Math.abs(rectBottom(r) - iceBlock.deckTopY()) <= PEER_STAND_EPS_PX) return true;
  }
  return false;
}

export function findCarrier(
  rider: CombatEnemy,
  peers: readonly CombatEnemy[],
): CombatEnemy | null {
  if (!canSupport(rider)) return null;
  const r = rider.rect();
  let best: CombatEnemy | null = null;
  let bestTop = -Infinity;
  for (const other of peers) {
    if (other === rider || !canSupport(other)) continue;
    const ob = other.rect();
    if (!horizontalOverlap(r, ob)) continue;
    const top = rectTop(ob);
    if (Math.abs(rectBottom(r) - top) > PEER_STAND_EPS_PX) continue;
    if (r.y + r.h * 0.5 < ob.y + ob.h * 0.5) continue;
    if (top > bestTop) {
      bestTop = top;
      best = other;
    }
  }
  return best;
}

export function linkCarriersAtTickStart(
  enemies: readonly CombatEnemy[],
  outLinks: Map<CombatEnemy, CombatEnemy>,
): void {
  outLinks.clear();
  for (const rider of enemies) {
    if (!isPeerWalkingEnemy(rider) || rider.isDead() || rider.isInCombatHitstun()) continue;
    const carrier = findCarrier(rider, enemies);
    if (carrier) outLinks.set(rider, carrier);
  }
}

export function applyCarrierMotion(carryLinks: Map<CombatEnemy, CombatEnemy>): void {
  for (const [rider, carrier] of carryLinks) {
    if (!isPeerWalkingEnemy(rider) || !isPeerWalkingEnemy(carrier)) continue;
    if (rider.isDead() || rider.isInCombatHitstun() || carrier.isDead()) continue;
    const dx = carrier.peerCarryDeltaX();
    const dy = carrier.peerCarryDeltaY();
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
    rider.translateWorld(dx, dy);
  }
}

export function stackSnapDeltaY(
  upper: CombatEnemy,
  upperBounds: Aabb,
  lower: CombatEnemy,
  lowerBounds: Aabb,
): number {
  if (!canSupport(lower) || upper === lower) return 0;
  if (!horizontalOverlap(upperBounds, lowerBounds)) return 0;
  if (rectBottom(upperBounds) < rectTop(lowerBounds) - PEER_STAND_EPS_PX) return 0;
  return rectTop(lowerBounds) - rectBottom(upperBounds);
}

export function shouldStackVertically(
  a: CombatEnemy,
  ra: Aabb,
  b: CombatEnemy,
  rb: Aabb,
  overlapY: number,
): boolean {
  if (overlapY < MIN_STACK_OVERLAP_PX) return false;
  const feetA = rectBottom(ra);
  const feetB = rectBottom(rb);
  let upper: CombatEnemy;
  let lower: CombatEnemy;
  let ru: Aabb;
  let rl: Aabb;
  if (feetA <= feetB + 1e-3) {
    upper = a;
    lower = b;
    ru = ra;
    rl = rb;
  } else {
    upper = b;
    lower = a;
    ru = rb;
    rl = ra;
  }
  if (!canSupport(lower)) return false;
  if (rectBottom(ru) < rectTop(rl) - PEER_STAND_EPS_PX * 2) return false;
  if (isPeerWalkingEnemy(upper) && upper.vy < -8 && rectBottom(ru) < rectTop(rl) + 1) {
    return false;
  }
  return (
    stackSnapDeltaY(upper, ru, lower, rl) !== 0 ||
    Math.abs(rectBottom(ru) - rectTop(rl)) <= PEER_STAND_EPS_PX
  );
}

/** True when feet rest on map tiles only (ignores peer decks). */
export function isGroundedOnTiles(self: CombatEnemy, map: TileMap): boolean {
  if (!isPeerWalkingEnemy(self) || self.vy < 0) return false;
  const r = self.rect();
  const probeY = rectBottom(r) + 0.5;
  const leftTile = Math.floor((rectLeft(r) + 0.001) / TILE_SIZE);
  const rightTile = Math.floor((rectRight(r) - 0.001) / TILE_SIZE);
  const ty = Math.floor(probeY / TILE_SIZE);
  for (let tx = leftTile; tx <= rightTile; tx++) {
    if (map.isSolidTile(tx, ty) || map.isPlatformTile(tx, ty)) return true;
  }
  return false;
}

export function isGrounded(
  self: CombatEnemy,
  map: TileMap,
  peers: readonly CombatEnemy[],
): boolean {
  if (isStandingOnPeer(self, peers)) return true;
  return isGroundedOnTiles(self, map);
}

/**
 * Ledge / floor ahead of the leading foot: map tiles plus peer decks at standing height.
 * @param dirSign +1 right, -1 left
 */
export function solidUnderFootAhead(
  self: CombatEnemy,
  map: TileMap,
  peers: readonly CombatEnemy[],
  dirSign: number,
): boolean {
  const r = self.rect();
  const footX = dirSign > 0 ? rectRight(r) + 0.5 : rectLeft(r) - 0.5;
  const probeY = rectBottom(r) + FOOT_AHEAD_PROBE_DROP_PX;
  const tx = Math.floor(footX / TILE_SIZE);
  const ty = Math.floor(probeY / TILE_SIZE);
  if (map.isSolidTile(tx, ty) || map.isPlatformTile(tx, ty)) return true;
  if (deckUnderFootX(self, peers, footX, rectBottom(r))) return true;
  return iceDeckUnderFootX(tickIce, footX, rectBottom(r));
}

function deckUnderFootX(
  self: CombatEnemy,
  peers: readonly CombatEnemy[],
  footX: number,
  riderFeetY: number,
): boolean {
  for (const other of peers) {
    if (other === self || !canSupport(other)) continue;
    const deck = other.rect();
    if (footX < rectLeft(deck) - 0.5 || footX > rectRight(deck) + 0.5) continue;
    if (Math.abs(riderFeetY - rectTop(deck)) <= PEER_STAND_EPS_PX + 2) return true;
  }
  return false;
}

export function isStackedPair(
  a: CombatEnemy,
  b: CombatEnemy,
  allPeers: readonly CombatEnemy[],
): boolean {
  if (a === b) return false;
  return findCarrier(a, allPeers) === b || findCarrier(b, allPeers) === a;
}

export function snapRidersToDecks(enemies: readonly CombatEnemy[]): void {
  for (const rider of enemies) {
    if (!isPeerWalkingEnemy(rider) || rider.isDead() || rider.isInCombatHitstun()) continue;
    const carrier = findCarrier(rider, enemies);
    if (!carrier) continue;
    const dy = rectTop(carrier.rect()) - rectBottom(rider.rect());
    if (Math.abs(dy) > 1e-6 && Math.abs(dy) <= PEER_STAND_EPS_PX) {
      rider.translateWorld(0, dy);
    }
  }
}

export function syncRiderVelocities(enemies: readonly CombatEnemy[]): void {
  for (const rider of enemies) {
    if (!isPeerWalkingEnemy(rider)) continue;
    if (rider.isDead() || rider.isInCombatHitstun()) continue;
    if (rider.peerRidingBehavior() !== "ride_deck") continue;
    const carrier = findCarrier(rider, enemies);
    if (!carrier || !isPeerWalkingEnemy(carrier)) continue;
    rider.applyPeerRidingVelocity(carrier.simulationVx(), 0);
  }
}

/** Feet depth for update sort (deepest / lowest first). */
export function enemyFeetY(e: CombatEnemy): number {
  return rectBottom(e.rect());
}

export function ridingDeck(
  self: PeerWalkingEnemy,
  map: TileMap,
  carrier: CombatEnemy | null,
): boolean {
  return (
    self.peerRidingBehavior() === "ride_deck" &&
    carrier != null &&
    !isGroundedOnTiles(self, map)
  );
}
