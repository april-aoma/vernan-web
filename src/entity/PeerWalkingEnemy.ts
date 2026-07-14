import type { HitboxPose } from "../collision/HitboxPose";
import type { CombatEnemy } from "./CombatEnemy";
import type { PeerRidingBehavior } from "./PeerRidingBehavior";

/**
 * Floor walkers that participate in peer decks / separation (Crawler, Mouse, …).
 * Mirrors Java CombatEnemy peer defaults + Enemy / Mouse collision anchors.
 */
export interface PeerWalkingEnemy extends CombatEnemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;

  peerRidingBehavior(): PeerRidingBehavior;
  simulationVx(): number;
  capturePeerCarryAnchor(): void;
  peerCarryDeltaX(): number;
  peerCarryDeltaY(): number;
  translateWorld(dx: number, dy: number): void;
  facingHintVelX(): number;
  flipPatrolDirection(): void;
  isOnGround(): boolean;
  isJumpSquatting(): boolean;
  canServeAsPeerPlatform(): boolean;
  isKuriboStompCorpseActive(): boolean;
  collisionPoseAt(ax: number, ay: number): HitboxPose;
  setPeerCarrierForTick(carrier: CombatEnemy | null): void;
  peerCarrierForTick(): CombatEnemy | null;
  applyPeerRidingVelocity(carrierVx: number, carrierVy: number): void;
}

export function isPeerWalkingEnemy(e: CombatEnemy): e is PeerWalkingEnemy {
  // Prefer peerRidingBehavior over collisionPoseAt — RollingHead also exposes
  // collisionPoseAt but is not a peer-deck walker (no Kuribo corpse / platform APIs).
  return typeof (e as PeerWalkingEnemy).peerRidingBehavior === "function";
}
