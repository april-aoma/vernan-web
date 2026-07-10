import type { FrisbeeAimSnapshot } from "./FrisbeeAimSnapshot";

/** GamePanel supplies subweapon firing; Player drives animation timing (Java SubweaponHost). */
export interface SubweaponHost {
  equippedSubweapon(): string | null;
  subweaponCooldownReady(): boolean;
  /** Start cooldown after projectile spawn / fire frame. */
  onSubweaponFired(): void;
  spawnFrisbee(worldX: number, worldY: number, facingSign: number, aim: FrisbeeAimSnapshot): void;
  activatePsychicSpoon(): void;
}
