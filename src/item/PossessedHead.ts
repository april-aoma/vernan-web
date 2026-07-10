import type { Aabb } from "../combat/CombatMath";
import type { Player } from "../entity/Player";
import type { CombatEnemy } from "../entity/CombatEnemy";
import { TILE_SIZE } from "../specs";
import type { TileMap } from "../world/TileMap";
import { ITEM_POSSESSED_HEAD } from "./possessedBossReward";

const BULLET_SPEED = 150;
const MUZZLE_OFF_X = 10;
const MUZZLE_OFF_Y = -2;
const BULLET_HALF = 3;
const DIE_FRAME_SEC = 0.18;
const DIE_MAX_AGE = DIE_FRAME_SEC * 2;

export type PossessedHeadBullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  dead: boolean;
  damage: number;
};

export type PossessedHeadDieFx = {
  x: number;
  y: number;
  age: number;
};

/**
 * Possessed Head melee effect — horizontal bullet on sword active-phase rising edge.
 * Tick from mount; do not edit Player attack guts.
 */
export class PossessedHeadController {
  readonly bullets: PossessedHeadBullet[] = [];
  readonly dieFx: PossessedHeadDieFx[] = [];
  private prevSwordActive = false;

  /**
   * @param swordActiveRising true when `player.attackPhase === 2` this frame and was not last frame
   */
  tick(
    dt: number,
    player: Player,
    map: TileMap,
    enemies: readonly CombatEnemy[],
    swordActiveRising: boolean,
  ): void {
    const owned = player.inventory.stacksOf(ITEM_POSSESSED_HEAD) > 0;
    if (owned && swordActiveRising) {
      this.spawn(player);
    }

    const mapW = map.getWidth() * TILE_SIZE;
    const mapH = map.getHeight() * TILE_SIZE;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 8 || b.y < 8 || b.x > mapW - 8 || b.y > mapH - 8) {
        b.dead = true;
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]!;
      if (!b.dead) continue;
      this.dieFx.push({ x: b.x, y: b.y, age: 0 });
      this.bullets.splice(i, 1);
    }

    this.applyEnemyHits(enemies);

    for (const fx of this.dieFx) fx.age += dt;
    for (let i = this.dieFx.length - 1; i >= 0; i--) {
      if (this.dieFx[i]!.age >= DIE_MAX_AGE) this.dieFx.splice(i, 1);
    }
  }

  /** Rising-edge helper for mount (phase 2). */
  consumeSwordActiveEdge(attackPhase: number): boolean {
    const active = attackPhase === 2;
    const edge = active && !this.prevSwordActive;
    this.prevSwordActive = active;
    return edge;
  }

  clear(): void {
    this.bullets.length = 0;
    this.dieFx.length = 0;
    this.prevSwordActive = false;
  }

  private spawn(player: Player): void {
    const facing = player.facing >= 0 ? 1 : -1;
    const mx = player.x + player.w * 0.5 + facing * MUZZLE_OFF_X;
    const my = player.y + player.h * 0.5 + MUZZLE_OFF_Y;
    const dmg = 0.5 + player.stats.attackDamage / 10;
    this.bullets.push({
      x: mx,
      y: my,
      vx: facing * BULLET_SPEED,
      vy: 0,
      age: 0,
      dead: false,
      damage: dmg,
    });
  }

  private applyEnemyHits(enemies: readonly CombatEnemy[]): void {
    for (const b of this.bullets) {
      if (b.dead) continue;
      const box: Aabb = {
        x: b.x - BULLET_HALF,
        y: b.y - BULLET_HALF,
        w: BULLET_HALF * 2,
        h: BULLET_HALF * 2,
      };
      for (const e of enemies) {
        if (e.isDead() || e.getHealth() <= 0) continue;
        if (!e.intersectsAttack(box)) continue;
        e.applyWeaponStrike({
          damage: b.damage,
          freezeFrames: 2,
          knockKind: "sword_stand",
          attackerX: b.x - 4,
          attackerW: 8,
          facing: b.vx >= 0 ? 1 : -1,
        });
        b.dead = true;
        break;
      }
    }
  }
}

/** Draw living head bullets + brief die strip (lil bullet art preferred). */
export function drawPossessedHeadBullets(
  g: CanvasRenderingContext2D,
  ctrl: PossessedHeadController,
  camera: { worldToDeviceX: (x: number) => number; worldToDeviceY: (y: number) => number },
  zoom: number,
  bulletSheet: ImageBitmap | null,
  dieSheet: ImageBitmap | null,
): void {
  const frameW = 8;
  for (const b of ctrl.bullets) {
    if (b.dead) continue;
    const left = b.x - frameW * 0.5;
    const top = b.y - frameW * 0.5;
    const dx = camera.worldToDeviceX(left);
    const dy = camera.worldToDeviceY(top);
    const dw = Math.floor(zoom * frameW);
    const dh = Math.floor(zoom * frameW);
    const fi = Math.floor(b.age / 0.09) % 2;
    if (bulletSheet && bulletSheet.width >= frameW * 2) {
      g.imageSmoothingEnabled = false;
      g.drawImage(bulletSheet, fi * frameW, 0, frameW, bulletSheet.height, dx, dy, dw, dh);
    } else {
      g.fillStyle = "#d8b0ff";
      g.beginPath();
      g.arc(dx + dw * 0.5, dy + dh * 0.5, dw * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (const fx of ctrl.dieFx) {
    const fi = Math.min(1, Math.floor(fx.age / DIE_FRAME_SEC));
    const left = fx.x - frameW * 0.5;
    const top = fx.y - frameW * 0.5;
    const dx = camera.worldToDeviceX(left);
    const dy = camera.worldToDeviceY(top);
    const dw = Math.floor(zoom * frameW);
    const dh = Math.floor(zoom * frameW);
    if (dieSheet && dieSheet.width >= frameW * (fi + 1)) {
      g.imageSmoothingEnabled = false;
      g.drawImage(dieSheet, fi * frameW, 0, frameW, dieSheet.height, dx, dy, dw, dh);
    }
  }
}
