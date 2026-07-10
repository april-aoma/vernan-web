import {
  SHY_MASK_CHARGE_FRAMES,
  SHY_MASK_CHARGE_SQUASH_X,
  SHY_MASK_COLOR_CYCLE_FRAMES,
  SHY_MASK_COLOR_FADE_START_FRAME,
  SHY_MASK_FLASH_GRACE_FRAMES,
} from "../../../config/Physics";

/** Run-scoped SMB2-style charge jump state for SHY_MASK. */
export class ShyMaskChargeState {
  private static readonly CHARGE_PALETTE = [0x4488ff, 0xffdd00, 0x44dd44];
  private static readonly CHARGED_PALETTE = [0x4488ff, 0xffdd00, 0x44dd44, 0xffffff];
  private static readonly MAX_FLASH_ALPHA = 220;

  private chargeFrames = 0;
  private flashGraceFrames = 0;
  private animFrames = 0;
  private _charged = false;
  private latchedSuperJump = false;
  private pendingSquashRecoverScaleX = 0;

  reset(): void {
    this.chargeFrames = 0;
    this.flashGraceFrames = 0;
    this.animFrames = 0;
    this._charged = false;
    this.latchedSuperJump = false;
    this.pendingSquashRecoverScaleX = 0;
  }

  charged(): boolean {
    return this._charged;
  }

  /** Preserve superjump through jumpsquat after jump during the flash window or at full charge. */
  latchSuperJumpWindup(): void {
    if (this._charged) this.latchedSuperJump = true;
  }

  cancelSuperJumpWindup(): void {
    this.latchedSuperJump = false;
  }

  consumeSuperJumpAtLiftOff(): boolean {
    if (!this.latchedSuperJump) return false;
    this.latchedSuperJump = false;
    this.consumeSuperJump();
    return true;
  }

  /**
   * Block normal ground jump while Down is held and charge is still building.
   * Full charge allows jump without releasing Down.
   */
  blocksGroundJumpWhileDownHeld(onGround: boolean, downHeld: boolean): boolean {
    return onGround && downHeld && !this._charged && this.chargeFrames > 0;
  }

  consumeSuperJump(): void {
    this.flashGraceFrames = 0;
    this.chargeFrames = 0;
    this._charged = false;
    this.latchedSuperJump = false;
  }

  flashRgb(): number {
    if (this.flashAlpha() <= 0) return 0;
    const palette = this._charged
      ? ShyMaskChargeState.CHARGED_PALETTE
      : ShyMaskChargeState.CHARGE_PALETTE;
    const cycleLen = palette.length * SHY_MASK_COLOR_CYCLE_FRAMES;
    const phase = ((this.animFrames % cycleLen) + cycleLen) % cycleLen;
    return palette[Math.floor(phase / SHY_MASK_COLOR_CYCLE_FRAMES)]!;
  }

  flashAlpha(): number {
    if (this.chargeFrames <= 0 && this.flashGraceFrames <= 0 && !this.latchedSuperJump) {
      return 0;
    }
    if (this.flashGraceFrames > 0 || this.latchedSuperJump) {
      return ShyMaskChargeState.MAX_FLASH_ALPHA;
    }
    if (this.chargeFrames < SHY_MASK_COLOR_FADE_START_FRAME) return 0;
    const fadeSpan = SHY_MASK_CHARGE_FRAMES - SHY_MASK_COLOR_FADE_START_FRAME;
    const t = (this.chargeFrames - SHY_MASK_COLOR_FADE_START_FRAME) / fadeSpan;
    return Math.round(ShyMaskChargeState.MAX_FLASH_ALPHA * Math.min(1, t));
  }

  /** Sustained charge crouch squash while Down is held. */
  chargeSquashVisible(downHeld: boolean): boolean {
    return downHeld && (this.chargeFrames > 0 || this._charged);
  }

  chargeScaleX(): number {
    const t = this.chargeSquashT();
    if (t <= 0) return 1;
    return 1 + (SHY_MASK_CHARGE_SQUASH_X - 1) * t;
  }

  chargeScaleY(): number {
    const sx = this.chargeScaleX();
    return sx === 1 ? 1 : 2 - sx;
  }

  /** One-shot scale captured when Down is released during a charge; cleared after read. */
  consumeSquashRecoverScaleX(): number {
    const sx = this.pendingSquashRecoverScaleX;
    this.pendingSquashRecoverScaleX = 0;
    return sx;
  }

  private chargeSquashT(): number {
    if (this.chargeFrames <= 0) return 0;
    return Math.min(1, this.chargeFrames / SHY_MASK_CHARGE_FRAMES);
  }

  private queueSquashRecover(): void {
    const sx = this.chargeScaleX();
    if (sx > 1 + 1e-9) this.pendingSquashRecoverScaleX = sx;
  }

  /**
   * @param ownsMask item owned this run
   * @param onGround feet on solid support
   * @param downHeld Down held this tick
   * @param canCharge not attacking, climbing, etc.
   */
  tick(ownsMask: boolean, onGround: boolean, downHeld: boolean, canCharge: boolean): void {
    if (!ownsMask) {
      this.reset();
      return;
    }

    if (this.flashGraceFrames > 0) {
      if (!this.latchedSuperJump) this.flashGraceFrames--;
      this.animFrames++;
      if (this.flashGraceFrames === 0 && !this.latchedSuperJump) {
        this._charged = false;
      }
      return;
    }

    if (!onGround) {
      if (!this.latchedSuperJump) this.reset();
      return;
    }

    if (!canCharge) {
      if (!this.latchedSuperJump) this.reset();
      return;
    }

    if (downHeld) {
      this.chargeFrames++;
      this.animFrames++;
      if (this.chargeFrames >= SHY_MASK_CHARGE_FRAMES) {
        this._charged = true;
      }
      return;
    }

    if (this.chargeFrames > 0 || this._charged) {
      this.queueSquashRecover();
    }

    if (this._charged) {
      this.flashGraceFrames = SHY_MASK_FLASH_GRACE_FRAMES;
      this.chargeFrames = 0;
      this.animFrames++;
      return;
    }

    if (this.chargeFrames > 0) {
      this.reset();
      return;
    }

    if (!this.latchedSuperJump) this.reset();
  }
}
