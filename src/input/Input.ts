/**
 * Browser keyboard input — mirrors Java `game.input.Input`.
 *
 * Critical browser/desktop parity:
 * - Press edges survive key-up until {@link endFrame} (tap-before-sim must not be eaten).
 * - Presses during skipped sim ticks are stashed ({@link stashPressEdgesForSkippedSim}).
 * - Only clear edges after a sim batch that actually ran.
 * - Gameplay keys always preventDefault (including OS key-repeat) so Arrow/Space can't scroll the page.
 * - While the game surface is focused, wheel/document scroll is locked.
 */
export class Input {
  private readonly keysDown = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private readonly releasedThisFrame = new Set<string>();
  /** Survives endFrame until the next consuming sim batch (timestop / zero substeps). */
  private readonly lagStashedPresses = new Set<string>();

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;
  private readonly onVisibility: () => void;
  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onTouchMove: (e: TouchEvent) => void;
  private focusTarget: HTMLElement | null = null;
  private scrollLocked = false;

  constructor() {
    this.onKeyDown = (e) => {
      // Let submit/name fields (and other text controls) receive WASD/C/etc.
      if (isEditableKeyTarget(e.target)) return;
      const code = e.code;
      // Always swallow gameplay keys — even OS key-repeat — so Arrow/Space don't scroll the page.
      if (shouldPrevent(code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.keysDown.has(code)) {
        this.pressedThisFrame.add(code);
      }
      this.keysDown.add(code);
    };
    this.onKeyUp = (e) => {
      if (isEditableKeyTarget(e.target)) return;
      const code = e.code;
      this.keysDown.delete(code);
      // Do NOT remove from pressedThisFrame: a tap can release before the next sim tick.
      this.releasedThisFrame.add(code);
      if (shouldPrevent(code)) e.preventDefault();
    };
    this.onBlur = () => {
      this.clearHardwareState();
      this.setScrollLock(false);
    };
    this.onVisibility = () => {
      if (document.visibilityState === "hidden") {
        this.clearHardwareState();
        this.setScrollLock(false);
      }
    };
    this.onWheel = (e) => {
      if (this.isGameFocused()) e.preventDefault();
    };
    this.onTouchMove = (e) => {
      if (this.isGameFocused()) e.preventDefault();
    };
  }

  /**
   * Listen on window (capture) so presses aren't lost when the canvas briefly
   * loses focus. Optional target is the focused game surface.
   */
  attach(target: HTMLElement | Window = window): void {
    this.detach();
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    // Non-passive so we can cancel scroll while the game is selected.
    window.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
    window.addEventListener("touchmove", this.onTouchMove, { capture: true, passive: false });
    if (target instanceof HTMLElement) {
      this.focusTarget = target;
      if (target.tabIndex < 0) target.tabIndex = 0;
      target.style.touchAction = "none";
      target.addEventListener("pointerdown", this.onPointerDown);
      target.addEventListener("focus", this.onFocus);
      target.addEventListener("blur", this.onTargetBlur);
      if (document.activeElement === target) this.setScrollLock(true);
    }
  }

  private readonly onPointerDown = (): void => {
    this.focusTarget?.focus({ preventScroll: true });
    this.setScrollLock(true);
  };

  private readonly onFocus = (): void => {
    this.setScrollLock(true);
  };

  private readonly onTargetBlur = (): void => {
    this.setScrollLock(false);
  };

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("wheel", this.onWheel, true);
    window.removeEventListener("touchmove", this.onTouchMove, true);
    if (this.focusTarget) {
      this.focusTarget.removeEventListener("pointerdown", this.onPointerDown);
      this.focusTarget.removeEventListener("focus", this.onFocus);
      this.focusTarget.removeEventListener("blur", this.onTargetBlur);
      this.focusTarget = null;
    }
    this.setScrollLock(false);
  }

  private isGameFocused(): boolean {
    if (!this.focusTarget) return this.scrollLocked;
    const active = document.activeElement;
    return (
      this.scrollLocked ||
      active === this.focusTarget ||
      (!!active && this.focusTarget.contains(active))
    );
  }

  /** Lock document scroll while the game canvas is focused. */
  private setScrollLock(on: boolean): void {
    if (this.scrollLocked === on) return;
    this.scrollLocked = on;
    const html = document.documentElement;
    const body = document.body;
    if (on) {
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
      body.style.overscrollBehavior = "none";
    } else {
      html.style.overflow = "";
      body.style.overflow = "";
      html.style.overscrollBehavior = "";
      body.style.overscrollBehavior = "";
    }
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code) || this.lagStashedPresses.has(code);
  }

  wasReleased(code: string): boolean {
    return this.releasedThisFrame.has(code);
  }

  /** Claim a press so another system (e.g. door) can take priority. */
  consumePress(code: string): void {
    this.pressedThisFrame.delete(code);
    this.lagStashedPresses.delete(code);
  }

  /**
   * Sim did not run this outer tick. Merge live press edges into the lag stash
   * so a tap during a hitch is still visible to the next update(dt).
   */
  stashPressEdgesForSkippedSim(): void {
    for (const code of this.pressedThisFrame) {
      this.lagStashedPresses.add(code);
    }
  }

  /** Clears press/release edges only; keeps held keys in {@link isDown}. */
  flushInputEdges(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.lagStashedPresses.clear();
  }

  /** Call after a sim batch that consumed input (mirrors Java endFrame). */
  endFrame(): void {
    this.flushInputEdges();
  }

  /** Window blur / tab hide — key-up may never arrive. */
  clearHardwareState(): void {
    this.keysDown.clear();
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.lagStashedPresses.clear();
  }

  /**
   * Room fade transitions (Java clearHardwareStateForRoomTransition):
   * flush press edges so door/ladder wasPressed does not carry into the next room,
   * but keep held keys so movement/jump holds survive the fade.
   */
  clearHardwareStateForRoomTransition(): void {
    this.flushInputEdges();
  }

  /** Desktop Vernan defaults (Arrow/WASD, Z/Space jump, X attack, C subweapon). */
  get left(): boolean {
    return this.isDown("ArrowLeft") || this.isDown("KeyA");
  }
  get right(): boolean {
    return this.isDown("ArrowRight") || this.isDown("KeyD");
  }
  get up(): boolean {
    return this.isDown("ArrowUp") || this.isDown("KeyW");
  }
  get down(): boolean {
    return this.isDown("ArrowDown") || this.isDown("KeyS");
  }
  get jump(): boolean {
    return this.isDown("KeyZ") || this.isDown("Space");
  }
  get attack(): boolean {
    return this.isDown("KeyX");
  }
  get subweapon(): boolean {
    return this.isDown("KeyC");
  }
  get shiftHeld(): boolean {
    return this.isDown("ShiftLeft") || this.isDown("ShiftRight");
  }
  get jumpPressed(): boolean {
    return this.wasPressed("KeyZ") || this.wasPressed("Space");
  }
  get attackPressed(): boolean {
    return this.wasPressed("KeyX");
  }
  get downPressed(): boolean {
    return this.wasPressed("ArrowDown") || this.wasPressed("KeyS");
  }
  get upPressed(): boolean {
    return this.wasPressed("ArrowUp") || this.wasPressed("KeyW");
  }
  get leftPressed(): boolean {
    return this.wasPressed("ArrowLeft") || this.wasPressed("KeyA");
  }
  get rightPressed(): boolean {
    return this.wasPressed("ArrowRight") || this.wasPressed("KeyD");
  }
  get subweaponPressed(): boolean {
    return this.wasPressed("KeyC");
  }
  /** Backpack primary cycle: Shift+X (Java). */
  get backpackPrimarySwitchPressed(): boolean {
    return this.shiftHeld && this.attackPressed;
  }
  /** Backpack subweapon cycle: Shift+C (Java). */
  get backpackSubweaponSwitchPressed(): boolean {
    return this.shiftHeld && this.subweaponPressed;
  }
  consumeBackpackPrimarySwitch(): void {
    if (!this.shiftHeld) return;
    this.consumePress("KeyX");
  }
  consumeBackpackSubweaponSwitch(): void {
    if (!this.shiftHeld) return;
    this.consumePress("KeyC");
  }
  get debugTogglePressed(): boolean {
    return this.wasPressed("F3") || this.wasPressed("Backquote");
  }

  /** Java VK_ENTER pause toggle (also Escape for web UX). */
  get pauseTogglePressed(): boolean {
    return this.wasPressed("Enter") || this.wasPressed("Escape");
  }

  /** Opt-in submit & quit from the pause menu. */
  get submitRunPressed(): boolean {
    return this.wasPressed("KeyQ");
  }
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function shouldPrevent(code: string): boolean {
  return (
    code.startsWith("Arrow") ||
    code === "Space" ||
    code === "KeyZ" ||
    code === "KeyX" ||
    code === "KeyC" ||
    code === "ShiftLeft" ||
    code === "ShiftRight" ||
    code === "KeyW" ||
    code === "KeyA" ||
    code === "KeyS" ||
    code === "KeyD" ||
    code === "Enter" ||
    code === "Escape" ||
    code === "KeyQ"
  );
}
