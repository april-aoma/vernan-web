import type { Player } from "../entity/Player";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemPickupHost } from "../item/effect/ItemPickupHost";
import type { DecoStamp } from "../tileset/placeAmbientDeco";
import type { TilesetProject } from "../tileset/TilesetProject";
import type { TileMap } from "../world/TileMap";
import { PickupKind } from "../world/BreakableLootRoll";
import {
  PluckOutcomeKind,
  fruitVariantIndex,
  rollGrassItemForRun,
  rollGrassLoot,
  type PluckOutcome,
} from "../world/PluckLootRoll";
import type { PluckTarget } from "../world/PluckTarget";
import { previewFromOutcome } from "./AllSeeingEyeDraw";
import { carryThrowDamage } from "./CarryThrowDamage";
import { CarryKind } from "./CarryKind";
import type { IceBlock } from "../entity/IceBlock";
import {
  breakableBlockPayload,
  fruitPayload,
  iceBlockPayload,
  isTileBreakableCarry,
  type CarryPayload,
} from "./CarryPayload";
import { snapshotIceHoldSprite } from "../combat/freezeCombatEnemy";
import { resolveGardeningPluckTarget } from "./GardeningGlovesPluck";
import type { GardeningGlovesHost } from "./GardeningGlovesHost";
import { ThrownCarryProjectile } from "./ThrownCarryProjectile";
import { fruitStatsForPayload } from "./FruitVariantStats";

const THROW_SPEED = 137;

export type GardeningWorldAccess = {
  player(): Player;
  map(): TileMap;
  roomDeco(): DecoStamp[];
  setRoomDeco(deco: DecoStamp[]): void;
  runSeed(): bigint;
  currentRoomId(): number;
  equippedSubweapon(): string | null;
  catalog(): ItemCatalog;
  pickupHost(): ItemPickupHost;
  playerThrowDamage(): number;
  fruitSprite(): ImageBitmap | null;
  project(): TilesetProject | null;
  removeDecoAt(tx: number, ty: number): void;
  pluckBreakableFloor(tx: number, ty: number, hiddenShell: boolean): void;
  snapshotBreakableTile(tx: number, ty: number): HTMLCanvasElement | null;
  isHiddenShellBreakable(tx: number, ty: number): boolean;
  shatterBreakableBlock(payload: import("./CarryPayload").CarryPayload, x: number, y: number): void;
  shatterIceBlock(payload: import("./CarryPayload").CarryPayload, x: number, y: number): void;
  iceBlocks(): readonly IceBlock[];
  removeIceBlockAt(index: number): void;
  snapshotIceHoldSprite(block: IceBlock): HTMLCanvasElement | null;
  spawnWorldHeartPickup(worldX: number, worldY: number): void;
  tryStrikeBreakables(hit: import("../combat/CombatMath").Aabb): boolean;
  storeSettledFruitForRoom(roomId: number, settled: ThrownCarryProjectile[]): void;
  settledFruitForRoom(roomId: number): ThrownCarryProjectile[];
  acquiredItemIds(): ReadonlySet<string>;
  grantPluckedItem(id: string): void;
};

/** Gardening-gloves pluck / hold / throw simulation (Java GardeningGlovesSupport thin). */
export class GardeningGlovesSupport implements GardeningGlovesHost {
  private readonly world: GardeningWorldAccess;
  private readonly thrown: ThrownCarryProjectile[] = [];
  private pendingGrassOutcome: PluckOutcome | null = null;
  private pendingGrassItem: string | null = null;
  private pluckBreakableSnap: HTMLCanvasElement | null = null;

  constructor(world: GardeningWorldAccess) {
    this.world = world;
  }

  thrownProjectiles(): readonly ThrownCarryProjectile[] {
    return this.thrown;
  }

  /** Drop in-flight throws / pending pluck for a full run restart. */
  clearForNewRun(): void {
    this.thrown.length = 0;
    this.pendingGrassOutcome = null;
    this.pendingGrassItem = null;
    this.pluckBreakableSnap = null;
  }

  equippedSubweapon(): string | null {
    return this.world.equippedSubweapon();
  }

  resolvePluckTarget(player: Player): PluckTarget | null {
    return resolveGardeningPluckTarget(
      player,
      this.world.map(),
      this.world.roomDeco(),
      this.world.project(),
      this.thrown,
      (tx, ty) => this.world.isHiddenShellBreakable(tx, ty),
      this.world.iceBlocks(),
    );
  }

  applyPluckWorldRemoval(target: PluckTarget): void {
    if (target.kind === "grass") {
      this.world.removeDecoAt(target.tx, target.ty);
      return;
    }
    if (target.kind === "breakable_floor") {
      if (!target.hiddenShell) {
        this.pluckBreakableSnap = this.world.snapshotBreakableTile(target.tx, target.ty);
      }
      this.world.pluckBreakableFloor(target.tx, target.ty, target.hiddenShell);
      return;
    }
    if (target.kind === "settled_fruit") {
      for (let i = this.thrown.length - 1; i >= 0; i--) {
        const p = this.thrown[i]!;
        if (
          p.isSettledFruit() &&
          Math.abs(p.x - target.worldX) < 0.5 &&
          Math.abs(p.y - target.worldY) < 0.5
        ) {
          this.thrown.splice(i, 1);
        }
      }
      return;
    }
    if (target.kind === "ice_block") {
      this.world.removeIceBlockAt(target.blockIndex);
    }
  }

  cancelPendingPluckLoot(): void {
    this.pendingGrassOutcome = null;
    this.pendingGrassItem = null;
    this.pluckBreakableSnap = null;
  }

  showPluckFinalFramePreview(target: PluckTarget, player: Player): void {
    if (target.kind === "grass") {
      const o = rollGrassLoot(
        this.world.runSeed(),
        this.world.currentRoomId(),
        target.tx,
        target.ty,
        target.decoTileId,
      );
      this.pendingGrassOutcome = o;
      if (o.kind === PluckOutcomeKind.ITEM) {
        this.pendingGrassItem = rollGrassItemForRun(
          this.world.runSeed(),
          this.world.currentRoomId(),
          target.tx,
          target.ty,
          target.decoTileId,
          this.world.acquiredItemIds(),
          this.world.catalog(),
        );
      }
      const preview = previewFromOutcome(o, this.pendingGrassItem);
      if (preview) {
        player.setCarryPluckPreview(preview);
      } else if (o.kind === PluckOutcomeKind.FRUIT) {
        const variant = fruitVariantIndex(
          this.world.runSeed(),
          this.world.currentRoomId(),
          target.tx,
          target.ty,
          target.decoTileId,
        );
        player.beginCarryHold(fruitPayload(variant));
      }
      return;
    }
    if (target.kind === "breakable_floor") {
      if (target.hiddenShell) return;
      const snap = this.pluckBreakableSnap;
      this.pluckBreakableSnap = null;
      player.beginCarryHold(
        breakableBlockPayload(target.tx, target.ty, false, snap),
      );
      return;
    }
    if (target.kind === "settled_fruit") {
      let variant = 0;
      for (const p of this.thrown) {
        if (
          p.isSettledFruit() &&
          Math.abs(p.x - target.worldX) < 0.5 &&
          Math.abs(p.y - target.worldY) < 0.5
        ) {
          variant = p.payload.fruitVariantIndex;
          break;
        }
      }
      player.beginCarryHold(fruitPayload(variant));
      return;
    }
    if (target.kind === "ice_block") {
      const blocks = this.world.iceBlocks();
      const block = blocks[target.blockIndex];
      if (block) {
        const snap = this.world.snapshotIceHoldSprite(block) ?? snapshotIceHoldSprite(block);
        player.beginCarryHold(iceBlockPayload(snap, block.lootCopy(), block.mirrorSourceX));
      }
    }
  }

  onPluckAnimComplete(target: PluckTarget, player: Player): void {
    this.pluckBreakableSnap = null;
    if (target.kind === "grass" && this.pendingGrassOutcome) {
      const o = this.pendingGrassOutcome;
      this.pendingGrassOutcome = null;
      const host = this.world.pickupHost();
      switch (o.kind) {
        case PluckOutcomeKind.HEART:
          if (player.health.isAtFullHealth) {
            this.world.spawnWorldHeartPickup(player.x + player.w * 0.5, player.y - 4);
          } else {
            player.health.heal(2);
            host.playPickupCollectFxAtPlayer(PickupKind.HEART, 1);
          }
          break;
        case PluckOutcomeKind.COIN_10:
          host.startHudResourceGain(10, 0);
          host.playPickupCollectFxAtPlayer(PickupKind.COIN_10, 1);
          break;
        case PluckOutcomeKind.COIN_ANY: {
          const coins = coinValue(o.coinKind ?? PickupKind.COIN_1);
          host.startHudResourceGain(coins, 0);
          host.playPickupCollectFxAtPlayer(o.coinKind ?? PickupKind.COIN_1, 1);
          break;
        }
        case PluckOutcomeKind.ITEM:
          this.world.grantPluckedItem(this.pendingGrassItem ?? "HEART_LT3");
          break;
        case PluckOutcomeKind.FRUIT:
          break;
      }
      this.pendingGrassItem = null;
      player.setCarryPluckPreview(null);
    }
  }

  spawnThrownCarry(
    payload: CarryPayload,
    worldX: number,
    worldY: number,
    facingSign: number,
    playerVx: number,
    arcThrow: boolean,
  ): void {
    if (!payload) return;
    const fruitStats = fruitStatsForPayload(payload);
    let speed = Math.max(ThrownCarryProjectile.MIN_THROW_SPEED, Math.abs(playerVx) + THROW_SPEED);
    speed *= fruitStats.speed;
    const vx = facingSign * speed;
    let vy = 0;
    if (arcThrow) vy = ThrownCarryProjectile.launchVy(payload, speed, true);
    this.thrown.push(new ThrownCarryProjectile(payload, worldX, worldY, vx, vy));
  }

  spawnGentleDrop(payload: CarryPayload, worldX: number, worldY: number): void {
    if (!payload) return;
    const vy = ThrownCarryProjectile.gentleDropVyFor(payload);
    this.thrown.push(new ThrownCarryProjectile(payload, worldX, worldY, 0, vy));
  }

  releaseCarryAt(payload: CarryPayload, worldX: number, worldY: number, _fromDeath: boolean): void {
    if (!payload) return;
    if (payload.kind === CarryKind.FRUIT) {
      this.spawnGentleDrop(payload, worldX, worldY);
      return;
    }
    if (isTileBreakableCarry(payload.kind)) {
      this.shatterCarryPayload(payload, worldX, worldY);
    }
  }

  private shatterCarryPayload(payload: CarryPayload, x: number, y: number): void {
    if (payload.kind === CarryKind.ICE_BLOCK) {
      this.world.shatterIceBlock(payload, x, y);
    } else if (payload.kind === CarryKind.BREAKABLE_BLOCK) {
      this.world.shatterBreakableBlock(payload, x, y);
    }
  }

  throwDamage(): number {
    return this.world.playerThrowDamage();
  }

  grassLootPreview(grassTx: number, grassTy: number, decoTileId: string): PluckOutcome {
    return rollGrassLoot(
      this.world.runSeed(),
      this.world.currentRoomId(),
      grassTx,
      grassTy,
      decoTileId,
    );
  }

  tick(dt: number, enemies: readonly import("../entity/CombatEnemy").CombatEnemy[]): void {
    const map = this.world.map();
    const baseThrowDamage = this.throwDamage();
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const proj = this.thrown[i]!;
      if (!proj.isAlive()) {
        this.shatterCarryPayload(proj.payload, proj.x, proj.y);
        this.thrown.splice(i, 1);
        continue;
      }
      proj.updatePhysics(dt, map);
      const dmg = carryThrowDamage(proj.payload, baseThrowDamage);
      const killed = proj.applyEnemyHits(enemies, dmg, (e, strike) => {
        e.applyProjectileStrike(strike);
      });
      if (killed || !proj.isAlive()) {
        this.shatterCarryPayload(proj.payload, proj.x, proj.y);
        this.thrown.splice(i, 1);
        continue;
      }
      if (proj.payload.kind === CarryKind.BREAKABLE_BLOCK) {
        const pose = proj.damagePose(proj.vx >= 0 ? 1 : -1);
        if (this.world.tryStrikeBreakables(pose.bounds())) {
          proj.kill();
          this.shatterCarryPayload(proj.payload, proj.x, proj.y);
          this.thrown.splice(i, 1);
        }
      }
    }
  }

  onRoomChange(previousRoom: number, newRoom: number): void {
    const settled: ThrownCarryProjectile[] = [];
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const proj = this.thrown[i]!;
      if (proj.isSettledFruit()) settled.push(proj.copySettled());
      this.thrown.splice(i, 1);
    }
    if (previousRoom >= 0) this.world.storeSettledFruitForRoom(previousRoom, settled);
    if (newRoom >= 0) {
      const restored = this.world.settledFruitForRoom(newRoom);
      this.thrown.push(...restored);
    }
  }
}

function coinValue(kind: PickupKind): number {
  switch (kind) {
    case PickupKind.COIN_10:
      return 10;
    case PickupKind.COIN_5:
      return 5;
    default:
      return 1;
  }
}
