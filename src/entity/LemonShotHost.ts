/** Lemon buster spawn host (Java LemonShotHost). */
export interface LemonShotHost {
  hasLemonShooter(): boolean;
  lemonShotsOnScreen(): number;
  lemonShotDamage(): number;
  lemonShotRefireSeconds(): number;
  spawnLemonShot(worldX: number, worldY: number, facingSign: number, damage: number): void;
}
