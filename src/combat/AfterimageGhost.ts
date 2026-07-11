import type { HitboxPose } from "../collision/HitboxPose";
import type { KnockbackKind } from "./CombatMath";
import type { SwordVisual } from "./SwordVisual";

/** Captured sword-smear state when an attack leaves its active frame (Java AfterimageSpawnSnapshot). */
export type AfterimageSpawnSnapshot = {
  originX: number;
  feetWorldY: number;
  attackerWidth: number;
  facing: number;
  bodyW: number;
  hitboxPose: HitboxPose;
  damage: number;
  knockbackKind: KnockbackKind;
  swordVisual: SwordVisual;
  groundCrouchAttack: boolean;
  heavyAttack1Smear: boolean;
};

/** Frozen sword-smear pose + lingering hitbox (Java AfterimageGhost). */
export class AfterimageGhost {
  static readonly MAX_ON_SCREEN = 3;
  static readonly DRAW_ALPHA = 0.5;
  static readonly REPLACE_FADE_FRAMES = 10;
  static readonly SMEAR_FRAME_INDEX = 1;
  static readonly HEAVY_ATTACK1_SMEAR_FRAME_INDEX = 2;

  readonly originX: number;
  readonly feetWorldY: number;
  readonly attackerWidth: number;
  readonly facing: number;
  readonly bodyW: number;
  readonly hitboxPose: HitboxPose;
  readonly damage: number;
  readonly knockbackKind: KnockbackKind;
  readonly swordVisual: SwordVisual;
  readonly groundCrouchAttack: boolean;
  readonly heavyAttack1Smear: boolean;

  private readonly hitEnemies = new Set<object>();
  private worldStrikeConsumed = false;
  private fadeFramesRemaining = 0;

  constructor(snapshot: AfterimageSpawnSnapshot) {
    this.originX = snapshot.originX;
    this.feetWorldY = snapshot.feetWorldY;
    this.attackerWidth = snapshot.attackerWidth;
    this.facing = snapshot.facing;
    this.bodyW = snapshot.bodyW;
    this.hitboxPose = snapshot.hitboxPose;
    this.damage = snapshot.damage;
    this.knockbackKind = snapshot.knockbackKind;
    this.swordVisual = snapshot.swordVisual;
    this.groundCrouchAttack = snapshot.groundCrouchAttack;
    this.heavyAttack1Smear = snapshot.heavyAttack1Smear;
  }

  isActive(): boolean {
    return this.fadeFramesRemaining <= 0;
  }

  beginReplaceFade(): void {
    this.fadeFramesRemaining = AfterimageGhost.REPLACE_FADE_FRAMES;
  }

  /** @returns true when fade finished and ghost should be removed */
  tickReplaceFade(): boolean {
    if (this.fadeFramesRemaining <= 0) return false;
    this.fadeFramesRemaining--;
    return this.fadeFramesRemaining <= 0;
  }

  drawAlpha(): number {
    if (this.fadeFramesRemaining <= 0) return AfterimageGhost.DRAW_ALPHA;
    return (
      AfterimageGhost.DRAW_ALPHA *
      (this.fadeFramesRemaining / AfterimageGhost.REPLACE_FADE_FRAMES)
    );
  }

  alreadyHit(enemy: object): boolean {
    return this.hitEnemies.has(enemy);
  }

  markHit(enemy: object): void {
    this.hitEnemies.add(enemy);
  }

  isWorldStrikeConsumed(): boolean {
    return this.worldStrikeConsumed;
  }

  markWorldStrikeConsumed(): void {
    this.worldStrikeConsumed = true;
  }
}
