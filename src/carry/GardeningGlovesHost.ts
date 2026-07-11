import type { Player } from "../entity/Player";
import type { PluckOutcome } from "../world/PluckLootRoll";
import type { PluckTarget } from "../world/PluckTarget";
import type { CarryPayload } from "./CarryPayload";

/** GamePanel supplies pluck resolution, world mutation, and projectile spawn (Java GardeningGlovesHost). */
export interface GardeningGlovesHost {
  equippedSubweapon(): string | null;

  resolvePluckTarget(player: Player): PluckTarget | null;

  applyPluckWorldRemoval(target: PluckTarget): void;

  cancelPendingPluckLoot(): void;

  showPluckFinalFramePreview(target: PluckTarget, player: Player): void;

  onPluckAnimComplete(target: PluckTarget, player: Player): void;

  spawnThrownCarry(
    payload: CarryPayload,
    worldX: number,
    worldY: number,
    facingSign: number,
    playerVx: number,
    arcThrow: boolean,
  ): void;

  spawnGentleDrop(payload: CarryPayload, worldX: number, worldY: number): void;

  releaseCarryAt(payload: CarryPayload, worldX: number, worldY: number, fromDeath: boolean): void;

  throwDamage(): number;

  grassLootPreview(grassTx: number, grassTy: number, decoTileId: string): PluckOutcome;
}
