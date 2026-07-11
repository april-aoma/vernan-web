import type { Player } from "../entity/Player";
import type { SubweaponHost } from "../entity/SubweaponHost";
import type { Input } from "../input/Input";
import { FIXED_STEP_HZ } from "../specs";
import type { PluckTarget } from "../world/PluckTarget";
import type { CarryPayload } from "./CarryPayload";
import { carryTopLeftOneCellAhead, carryTopLeftRelease } from "./CarryFruitLayout";
import type { GardeningGlovesHost } from "./GardeningGlovesHost";

export type PluckInstantPreview = {
  outcomeKind: import("../world/PluckLootRoll").PluckOutcomeKind;
  coinKind: import("../world/BreakableLootRoll").PickupKind | null;
  itemId: string | null;
};

const PLUCK_FRAME_TICKS = [6, 6, 6, 6];
const THROW_FRAME_TICKS = [5, 5, 5, 5, 5];
const PLUCK_FRAMES = 4;
const THROW_FRAMES = 5;
export const PLUCK_ACTION_INDEX = 3;
const THROW_RELEASE_INDEX = 1;

/** Gardening-gloves carry / pluck / throw state owned by Player (Java PlayerCarry). */
export class PlayerCarry {
  private animPhase = 0;
  private frameIndex = 0;
  private frameTimeLeft = 0;
  private holding = false;
  private payload: CarryPayload | null = null;
  private pluckTarget: PluckTarget | null = null;
  private pluckPreview: PluckInstantPreview | null = null;
  private throwSpawnFired = false;
  private dropOneCellAhead = false;
  private throwBeganOnGround = true;

  resetAnim(): void {
    this.animPhase = 0;
    this.frameIndex = 0;
    this.frameTimeLeft = 0;
    this.throwSpawnFired = false;
    this.dropOneCellAhead = false;
    this.throwBeganOnGround = false;
  }

  clearAll(): void {
    this.resetAnim();
    this.holding = false;
    this.payload = null;
    this.pluckTarget = null;
    this.pluckPreview = null;
  }

  isHolding(): boolean {
    return this.holding && this.payload != null;
  }

  isPlucking(): boolean {
    return this.animPhase === 1;
  }

  isThrowing(): boolean {
    return this.animPhase === 2;
  }

  throwStartedOnGround(): boolean {
    return this.throwBeganOnGround;
  }

  isAnimating(): boolean {
    return this.animPhase !== 0;
  }

  holdOverhead(): boolean {
    return this.isHolding() || (this.isPlucking() && (this.payload != null || this.pluckPreview != null));
  }

  carryPayload(): CarryPayload | null {
    return this.payload;
  }

  pluckInstantPreview(): PluckInstantPreview | null {
    return this.pluckPreview;
  }

  pluckFrameIndex(): number {
    return this.animPhase === 1 ? Math.min(this.frameIndex, PLUCK_FRAMES - 1) : 0;
  }

  throwFrameIndex(): number {
    return this.animPhase === 2 ? Math.min(this.frameIndex, THROW_FRAMES - 1) : 0;
  }

  throwBrakesHorizontal(): boolean {
    return this.isThrowing() && this.throwFrameIndex() === THROW_RELEASE_INDEX;
  }

  update(dt: number, input: Input, player: Player, host: GardeningGlovesHost | null, subHost: SubweaponHost | null): void {
    if (!host || !subHost || subHost.equippedSubweapon() !== "GARDENING_GLOVES") {
      if (!this.holding) this.clearAll();
      return;
    }
    if (this.animPhase === 2) {
      this.tickThrow(dt, input, player, host);
      return;
    }
    if (this.animPhase === 1) {
      this.tickPluck(dt, player, host);
      return;
    }
    if (this.holding) {
      this.handleHoldInput(input, player, host);
      return;
    }
    this.tryStartPluck(input, player, host);
  }

  private tryStartPluck(input: Input, player: Player, host: GardeningGlovesHost): void {
    if (!input.subweaponPressed) return;
    if (
      !player.onGround ||
      player.isAttacking() ||
      player.climbing ||
      player.isGetupLocked() ||
      player.landingLockFrames > 0
    ) {
      return;
    }
    const target = host.resolvePluckTarget(player);
    if (!target) return;
    this.pluckTarget = target;
    this.pluckPreview = null;
    this.payload = null;
    this.animPhase = 1;
    this.frameIndex = 0;
    this.frameTimeLeft = PLUCK_FRAME_TICKS[0]! / FIXED_STEP_HZ;
    player.fireAnimCueStripForCarry("pluck", 0);
  }

  private tickPluck(dt: number, player: Player, host: GardeningGlovesHost): void {
    this.frameTimeLeft -= dt;
    if (this.frameTimeLeft > 0) return;
    const last = PLUCK_FRAMES - 1;
    if (this.frameIndex >= last) {
      if (this.pluckTarget) host.onPluckAnimComplete(this.pluckTarget, player);
      this.animPhase = 0;
      this.frameIndex = 0;
      this.frameTimeLeft = 0;
      this.pluckTarget = null;
      this.pluckPreview = null;
      return;
    }
    const prior = this.frameIndex;
    this.frameIndex++;
    if (this.frameIndex === PLUCK_ACTION_INDEX && this.pluckTarget) {
      const target = this.pluckTarget;
      const worldRemovalFirst =
        target.kind === "breakable_floor" || target.kind === "grass";
      if (worldRemovalFirst) {
        host.applyPluckWorldRemoval(target);
        host.showPluckFinalFramePreview(target, player);
      } else {
        host.showPluckFinalFramePreview(target, player);
        host.applyPluckWorldRemoval(target);
      }
    }
    this.frameTimeLeft = PLUCK_FRAME_TICKS[this.frameIndex]! / FIXED_STEP_HZ;
    player.fireAnimCueStripForCarry("pluck", this.frameIndex, prior);
  }

  private handleHoldInput(input: Input, player: Player, _host: GardeningGlovesHost): void {
    if (player.isGetupLocked()) return;
    const throwPressed = input.attackPressed || input.subweaponPressed;
    const gentle = input.down && !input.up && (input.attackPressed || input.subweaponPressed);
    if (gentle) {
      this.dropOneCellAhead = true;
      this.beginThrowAnim(player);
      return;
    }
    if (throwPressed) this.beginThrowAnim(player);
  }

  private beginThrowAnim(player: Player): void {
    this.animPhase = 2;
    this.frameIndex = 0;
    this.frameTimeLeft = THROW_FRAME_TICKS[0]! / FIXED_STEP_HZ;
    this.throwSpawnFired = false;
    this.throwBeganOnGround = player.onGround;
    player.fireAnimCueStripForCarry("throw", 0);
  }

  private spawnThrowPayload(
    player: Player,
    host: GardeningGlovesHost,
    input: Input,
    gentleDrop: boolean,
  ): void {
    if (this.throwSpawnFired || !this.payload || !host) return;
    if (gentleDrop) {
      const spawn = carryTopLeftOneCellAhead(
        player.x,
        player.w,
        player.y + player.h,
        player.facing,
        this.payload.kind,
      );
      host.spawnGentleDrop(this.payload, spawn[0], spawn[1]);
    } else {
      const spawn = carryTopLeftRelease(
        player.x,
        player.w,
        player.y + player.h,
        player.facing,
        this.payload.kind,
      );
      host.spawnThrownCarry(
        this.payload,
        spawn[0],
        spawn[1],
        player.facing,
        player.vx,
        input.up && !input.down,
      );
    }
    this.holding = false;
    this.payload = null;
    this.pluckPreview = null;
    this.throwSpawnFired = true;
    this.dropOneCellAhead = false;
  }

  cancelThrowOnGroundChange(player: Player, host: GardeningGlovesHost, input: Input): void {
    if (!this.isThrowing()) return;
    this.spawnThrowPayload(player, host, input, false);
    this.resetAnim();
  }

  private tickThrow(dt: number, input: Input, player: Player, host: GardeningGlovesHost): void {
    this.frameTimeLeft -= dt;
    if (this.frameTimeLeft > 0) return;
    if (this.frameIndex === THROW_RELEASE_INDEX) {
      this.spawnThrowPayload(player, host, input, this.dropOneCellAhead);
    }
    const prior = this.frameIndex;
    this.frameIndex++;
    if (this.frameIndex >= THROW_FRAMES) {
      this.animPhase = 0;
      this.frameIndex = 0;
      this.frameTimeLeft = 0;
      this.throwSpawnFired = false;
    } else {
      this.frameTimeLeft = THROW_FRAME_TICKS[this.frameIndex]! / FIXED_STEP_HZ;
      player.fireAnimCueStripForCarry("throw", this.frameIndex, prior);
    }
  }

  onHurtOrDeath(player: Player, host: GardeningGlovesHost | null, death: boolean): void {
    if (!host) return;
    if (this.isPlucking()) {
      if (this.pluckFrameIndex() < PLUCK_ACTION_INDEX) {
        this.cancelPluck(host);
        return;
      }
      this.releaseCarryAt(player, host, death);
      host.cancelPendingPluckLoot();
      this.cancelPluck(host);
      return;
    }
    if (this.isThrowing()) {
      if (this.payload) this.releaseCarryAt(player, host, death);
      this.holding = false;
      this.payload = null;
      this.pluckPreview = null;
      this.resetAnim();
      return;
    }
    if (this.isHolding() && this.payload) {
      this.releaseCarryAt(player, host, death);
      this.holding = false;
      this.payload = null;
      this.pluckPreview = null;
      this.resetAnim();
    }
  }

  private releaseCarryAt(player: Player, host: GardeningGlovesHost, death: boolean): void {
    if (!this.payload) return;
    const drop = carryTopLeftRelease(
      player.x,
      player.w,
      player.y + player.h,
      player.facing,
      this.payload.kind,
    );
    host.releaseCarryAt(this.payload, drop[0], drop[1], death);
  }

  private cancelPluck(host: GardeningGlovesHost): void {
    host.cancelPendingPluckLoot();
    this.pluckTarget = null;
    this.pluckPreview = null;
    this.holding = false;
    this.payload = null;
    this.resetAnim();
  }

  beginHold(payload: CarryPayload | null): void {
    this.payload = payload;
    this.holding = payload != null;
    this.pluckPreview = null;
    if (this.animPhase !== 1) {
      this.animPhase = 0;
      this.resetAnim();
    }
  }

  setPluckPreview(preview: PluckInstantPreview | null): void {
    this.pluckPreview = preview;
    if (preview != null) {
      this.holding = false;
      this.payload = null;
    }
  }

  dropHeldGentleForWeaponSwitch(player: Player, host: GardeningGlovesHost | null): void {
    this.dropHeldGentleImmediate(player, host);
  }

  dropHeldGentleForAirDodge(player: Player, host: GardeningGlovesHost | null): void {
    this.dropHeldGentleImmediate(player, host);
  }

  private dropHeldGentleImmediate(player: Player, host: GardeningGlovesHost | null): void {
    if (!this.isHolding() || !this.payload || !host) return;
    const spawn = carryTopLeftOneCellAhead(
      player.x,
      player.w,
      player.y + player.h,
      player.facing,
      this.payload.kind,
    );
    host.spawnGentleDrop(this.payload, spawn[0], spawn[1]);
    this.holding = false;
    this.payload = null;
    this.pluckPreview = null;
    this.resetAnim();
  }

  blocksMovement(): boolean {
    return this.animPhase !== 0;
  }

  blocksJump(): boolean {
    return this.isAnimating();
  }

  blocksClimb(): boolean {
    return this.isHolding() || this.isAnimating();
  }

  blocksCrouch(): boolean {
    return this.isHolding();
  }

  blocksAttack(): boolean {
    return this.isHolding() || this.isAnimating();
  }

  blocksOneWayDrop(): boolean {
    return this.isHolding();
  }
}
