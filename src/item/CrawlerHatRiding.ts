import type { Aabb } from "../combat/CombatMath";
import { PLATFORM_DECK_SLACK_PX } from "../config/Physics";
import type { CombatEnemy } from "../entity/CombatEnemy";
import { canSupport } from "../entity/EnemyPeerPlatforms";
import { GoldenRoach } from "../entity/GoldenRoach";
import type { Player } from "../entity/Player";
import type { Input } from "../input/Input";

/**
 * CRAWLER_HAT: ride challenge-1 walkers (Java CrawlerHatRiding).
 */
export class CrawlerHatRiding {
  static readonly PLAYER_DECK_SLACK_PX = 6;

  static isEnabled(crawlerHatStacks: number): boolean {
    return crawlerHatStacks > 0;
  }

  static isRideable(e: CombatEnemy): boolean {
    if (!e || e instanceof GoldenRoach) return false;
    return canSupport(e);
  }

  static crawlerDeckPlatforms(
    enemies: readonly CombatEnemy[],
    crawlerHatStacks: number,
  ): Aabb[] | null {
    if (!this.isEnabled(crawlerHatStacks) || enemies.length === 0) return null;
    const decks: Aabb[] = [];
    for (const e of enemies) {
      if (!this.isRideable(e)) continue;
      const hull = e.rect();
      decks.push({ x: hull.x, y: hull.y, w: hull.w, h: hull.h });
    }
    return decks.length ? decks : null;
  }

  static mergePlatformDecks(
    pedestalDecks: Aabb[] | null,
    crawlerDecks: Aabb[] | null,
  ): Aabb[] | null {
    if (!pedestalDecks?.length) return crawlerDecks;
    if (!crawlerDecks?.length) return pedestalDecks;
    return [...pedestalDecks, ...crawlerDecks];
  }

  static findMountedCarrier(
    player: Player,
    enemies: readonly CombatEnemy[],
  ): CombatEnemy | null {
    if (player.health.isDead) return null;
    if (player.vy < -48) return null;
    const feet = player.feetSupportBounds();
    let best: CombatEnemy | null = null;
    let bestTop = -Infinity;
    for (const e of enemies) {
      if (!this.isRideable(e)) continue;
      const hull = e.rect();
      if (!horizontalOverlap(feet, hull)) continue;
      const deckTop = hull.y;
      if (
        feet.y + feet.h < deckTop - this.PLAYER_DECK_SLACK_PX ||
        feet.y + feet.h > deckTop + this.PLAYER_DECK_SLACK_PX
      ) {
        continue;
      }
      if (deckTop > bestTop) {
        bestTop = deckTop;
        best = e;
      }
    }
    return best;
  }

  static blocksPlayerJump(_player: Player, input: Input, mounted: CombatEnemy | null): boolean {
    if (!mounted) return false;
    return input.down && input.jumpPressed;
  }

  static blocksLadderDownLatch(crawlerHatStacks: number): boolean {
    return this.isEnabled(crawlerHatStacks);
  }

  static clearCrawlerHatFlags(enemies: readonly CombatEnemy[]): void {
    for (const e of enemies) {
      const ce = e as CombatEnemy & {
        setCrawlerHatPacified?: (v: boolean) => void;
        setCrawlerHatPlayerRidden?: (v: boolean) => void;
        setCrawlerHatRideFacing?: (v: number) => void;
        setCrawlerHatRideForceHop?: (v: boolean) => void;
      };
      ce.setCrawlerHatPacified?.(false);
      ce.setCrawlerHatPlayerRidden?.(false);
      ce.setCrawlerHatRideFacing?.(0);
      ce.setCrawlerHatRideForceHop?.(false);
    }
  }

  static primeMountedCrawler(
    crawlerHatStacks: number,
    player: Player,
    input: Input,
    enemies: readonly CombatEnemy[],
  ): void {
    this.clearCrawlerHatFlags(enemies);
    if (!this.isEnabled(crawlerHatStacks)) return;
    const mounted = this.findMountedCarrier(player, enemies);
    const steering = input.down;
    const rideForceHop = steering && input.jumpPressed;
    const rideFacing = steering ? player.facing : 0;
    for (const e of enemies) {
      const ce = e as CombatEnemy & {
        setCrawlerHatPacified?: (v: boolean) => void;
        setCrawlerHatPlayerRidden?: (v: boolean) => void;
        setCrawlerHatRideFacing?: (v: number) => void;
        setCrawlerHatRideForceHop?: (v: boolean) => void;
      };
      if (this.isRideable(e) || canSupport(e)) {
        ce.setCrawlerHatPacified?.(true);
      }
      if (!this.isRideable(e)) continue;
      const mountedSteering = e === mounted && steering;
      ce.setCrawlerHatPlayerRidden?.(mountedSteering);
      ce.setCrawlerHatRideFacing?.(mountedSteering ? rideFacing : 0);
      ce.setCrawlerHatRideForceHop?.(mountedSteering && rideForceHop);
    }
  }

  static correctHullPenetration(
    player: Player,
    enemies: readonly CombatEnemy[],
    crawlerHatStacks: number,
  ): void {
    if (!this.isEnabled(crawlerHatStacks) || player.vy < -32) return;
    const feet = player.feetSupportBounds();
    const landSlack = PLATFORM_DECK_SLACK_PX;
    for (const e of enemies) {
      if (!this.isRideable(e)) continue;
      const hull = e.rect();
      if (!horizontalOverlap(feet, hull)) continue;
      const deckTop = hull.y;
      const feetBot = feet.y + feet.h;
      if (feetBot > deckTop + landSlack && feetBot <= hull.y + hull.h + 1) {
        player.y += deckTop - feetBot;
        if (player.vy > 0) player.vy = 0;
        player.onGround = true;
      }
    }
  }
}

function horizontalOverlap(a: Aabb, b: Aabb): boolean {
  return a.x + a.w > b.x + 1e-3 && a.x < b.x + b.w - 1e-3;
}
