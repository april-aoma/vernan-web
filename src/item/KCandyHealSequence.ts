/** Timed full-heal presentation for k-candy (Java KCandyHealSequence). */
export class KCandyHealSequence {
  private active = false;
  private startRed = 0;
  private targetRed = 0;
  private displayedRedHp = 0;
  private elapsedSec = 0;
  private durationSec = 0;
  private heartsToSpawn = 0;
  private heartsSpawned = 0;
  private nextHeartSpawnSec = 0;

  isActive(): boolean {
    return this.active;
  }

  displayedRed(): number {
    return this.displayedRedHp;
  }

  begin(currentRed: number, redMax: number, durationSec: number, heartsToSpawn: number): void {
    this.active = true;
    this.startRed = currentRed;
    this.targetRed = redMax;
    this.displayedRedHp = currentRed;
    this.elapsedSec = 0;
    this.durationSec = Math.max(0.35, durationSec);
    this.heartsToSpawn = Math.max(1, heartsToSpawn);
    this.heartsSpawned = 0;
    this.nextHeartSpawnSec = 0;
  }

  /** @returns true when the sequence finished this tick */
  tick(dt: number, spawnHeartFx: () => void): boolean {
    if (!this.active) return false;
    this.elapsedSec += dt;
    const u = Math.min(1, this.elapsedSec / this.durationSec);
    this.displayedRedHp = this.startRed + Math.round((this.targetRed - this.startRed) * u);
    while (this.heartsSpawned < this.heartsToSpawn && this.elapsedSec >= this.nextHeartSpawnSec) {
      spawnHeartFx();
      this.heartsSpawned++;
      this.nextHeartSpawnSec += this.durationSec / this.heartsToSpawn;
    }
    if (this.elapsedSec >= this.durationSec) {
      this.displayedRedHp = this.targetRed;
      this.active = false;
      return true;
    }
    return false;
  }

  cancel(): void {
    this.active = false;
  }
}
