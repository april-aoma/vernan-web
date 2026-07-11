import type { FrisbeeAimSnapshot } from "./FrisbeeAimSnapshot";
import type { LemonShotHost } from "./LemonShotHost";

/** GamePanel supplies subweapon firing; Player drives animation timing (Java SubweaponHost). */
export interface SubweaponHost extends LemonShotHost {
  equippedSubweapon(): string | null;
  subweaponCooldownReady(): boolean;
  /** Start cooldown after projectile spawn / fire frame. */
  onSubweaponFired(): void;
  spawnFrisbee(worldX: number, worldY: number, facingSign: number, aim: FrisbeeAimSnapshot): void;
  spawnWarpOrb(worldX: number, worldY: number, facingSign: number, throwFromGround: boolean): void;
  activatePsychicSpoon(): void;
  activateKCandy(): void;
  kCandyUsesRemaining(): number;
  kCandyCanFire(): boolean;
}
