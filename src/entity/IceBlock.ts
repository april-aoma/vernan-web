import { iceSpawnShakeDevicePx, ICE_SPAWN_INVULN_SEC, ICE_SPAWN_SHAKE_SEC } from "../combat/IceBlockFx";
import type { Aabb } from "../combat/CombatMath";
import type { IceBlockLoot } from "./IceBlockLoot";

/** Frozen room enemy — full solid, no gravity, persists per room (Java IceBlock). */
export class IceBlock {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly sprite: HTMLCanvasElement;
  readonly mirrorSourceX: boolean;
  readonly kuriboPancake: boolean;
  readonly squashScaleX: number;
  readonly squashScaleY: number;
  readonly corpseAngleRad: number;
  private invulnSec = ICE_SPAWN_INVULN_SEC;
  private shakeSec = ICE_SPAWN_SHAKE_SEC;
  private readonly loot: IceBlockLoot[] = [];

  constructor(
    x: number,
    y: number,
    w: number,
    h: number,
    sprite: HTMLCanvasElement,
    mirrorSourceX: boolean,
    kuriboPancake = false,
    squashScaleX = 1,
    squashScaleY = 1,
    corpseAngleRad = 0,
  ) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.sprite = sprite;
    this.mirrorSourceX = mirrorSourceX;
    this.kuriboPancake = kuriboPancake;
    this.squashScaleX = squashScaleX;
    this.squashScaleY = squashScaleY;
    this.corpseAngleRad = corpseAngleRad;
  }

  rect(): Aabb {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  deckTopY(): number {
    return this.y;
  }

  breakableNow(): boolean {
    return this.invulnSec <= 0;
  }

  tick(dt: number): void {
    this.invulnSec = Math.max(0, this.invulnSec - dt);
    this.shakeSec = Math.max(0, this.shakeSec - dt);
  }

  shakeDevicePx(): number {
    return iceSpawnShakeDevicePx(this.shakeSec);
  }

  addLoot(kind: IceBlockLoot["kind"]): void {
    this.loot.push({ kind });
  }

  lootCopy(): readonly IceBlockLoot[] {
    return this.loot;
  }
}
