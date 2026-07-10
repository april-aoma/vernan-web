/**
 * Shared room fade + door pose + boss floor-ascend blackout
 * (Java GamePanel TransitionPhase / door poses / LEVEL_LOAD_BLACK).
 */
export const ROOM_FADE_FRAMES = 20;
export const ROOM_FADE_ALPHA_PEAK = 220;
/** Hold doorexit pose this many frames after fade-in ends (horizontal doors only). */
export const DOOR_EXIT_POSE_HOLD_FRAMES = 3;

/** Minimum blackout before revealing the next dungeon level (boss ladder ascend). */
export const LEVEL_TRANSITION_MIN_BLACK_SEC = 5.0;
/** Climb in place on black before the descent strip. */
export const LEVEL_TRANS_CLIMB_SEC = 3.0;
/** Descent strip duration (overlaps move ease). */
export const LEVEL_TRANS_DESCEND_SEC = 2.0;
export const LEVEL_TRANS_MOVE_TOTAL_SEC = LEVEL_TRANSITION_MIN_BLACK_SEC;
/** `leveltransition` sheet: 352×48 → 11×32 frames. */
export const LEVEL_TRANS_SHEET_FRAMES = 11;
/** Feet row in Vernan art; strip may extend below this row. */
export const LEVEL_TRANS_FEET_ROW_WORLD_PX = 32;
/** 48px strip cels pad climb pose down 16px vs the 32px climb composite. */
export const LEVEL_TRANS_STRIP_TOP_PAD_WORLD_PX = 48 - LEVEL_TRANS_FEET_ROW_WORLD_PX;

export enum TransitionPhase {
  NONE = 0,
  FADE_OUT = 1,
  FADE_IN = 2,
  /** Full black while next dungeon builds (min duration; then fade in). */
  LEVEL_LOAD_BLACK = 3,
}

export enum DoorTransitionPose {
  NONE = 0,
  ENTER = 1,
  EXIT = 2,
}

export type LevelAscendState = {
  pending: boolean;
  blackRemaining: number;
  climbSec: number;
  descendSec: number;
  moveSec: number;
  climbAnimAccum: number;
  climbFrame: number;
  animFrame: number;
  newFloorApplied: boolean;
  /** Device-space feet Y at fade-out / blackout start. */
  startFeetScreenY: number;
  startCenterScreenX: number;
  /** Device-space target after next floor spawn (NaN until applied). */
  endFeetScreenY: number;
  endCenterScreenX: number;
};

export type RoomTransitionState = {
  phase: TransitionPhase;
  framesLeft: number;
  /** Horizontal door travel uses enter/exit Vernan poses. */
  horizontalDoor: boolean;
  pose: DoorTransitionPose;
  exitPoseHoldFrames: number;
  pendingRoomId: number;
  pendingSpawnKind: number;
  /** Boss floor ascend cinematic. */
  levelAscend: LevelAscendState;
};

export function createLevelAscendState(): LevelAscendState {
  return {
    pending: false,
    blackRemaining: 0,
    climbSec: 0,
    descendSec: 0,
    moveSec: 0,
    climbAnimAccum: 0,
    climbFrame: 0,
    animFrame: 0,
    newFloorApplied: false,
    startFeetScreenY: 0,
    startCenterScreenX: 0,
    endFeetScreenY: Number.NaN,
    endCenterScreenX: Number.NaN,
  };
}

export function createRoomTransitionState(): RoomTransitionState {
  return {
    phase: TransitionPhase.NONE,
    framesLeft: 0,
    horizontalDoor: false,
    pose: DoorTransitionPose.NONE,
    exitPoseHoldFrames: 0,
    pendingRoomId: -1,
    pendingSpawnKind: 0,
    levelAscend: createLevelAscendState(),
  };
}

export function isRoomTransitionActive(t: RoomTransitionState): boolean {
  return (
    t.phase !== TransitionPhase.NONE ||
    t.exitPoseHoldFrames > 0 ||
    t.levelAscend.pending
  );
}

export function startHorizontalDoorTransition(
  t: RoomTransitionState,
  roomId: number,
  spawnKind: number,
): void {
  t.horizontalDoor = true;
  t.pose = DoorTransitionPose.ENTER;
  t.exitPoseHoldFrames = 0;
  t.pendingRoomId = roomId;
  t.pendingSpawnKind = spawnKind;
  t.levelAscend.pending = false;
  t.phase = TransitionPhase.FADE_OUT;
  t.framesLeft = ROOM_FADE_FRAMES;
}

export function startVerticalRoomTransition(
  t: RoomTransitionState,
  roomId: number,
  spawnKind: number,
): void {
  t.horizontalDoor = false;
  t.pose = DoorTransitionPose.NONE;
  t.exitPoseHoldFrames = 0;
  t.pendingRoomId = roomId;
  t.pendingSpawnKind = spawnKind;
  t.levelAscend.pending = false;
  t.phase = TransitionPhase.FADE_OUT;
  t.framesLeft = ROOM_FADE_FRAMES;
}

/**
 * Boss ascend: fade out on current room, then LEVEL_LOAD_BLACK cinematic.
 * {@code feetScreenY}/{@code centerScreenX} are device-space anchors at start.
 */
export function startNextLevelAscend(
  t: RoomTransitionState,
  feetScreenY: number,
  centerScreenX: number,
): void {
  if (t.phase !== TransitionPhase.NONE || t.levelAscend.pending) return;
  t.horizontalDoor = false;
  t.pose = DoorTransitionPose.NONE;
  t.exitPoseHoldFrames = 0;
  t.pendingRoomId = -1;
  t.pendingSpawnKind = 0;
  const la = t.levelAscend;
  la.pending = true;
  la.blackRemaining = 0;
  la.climbSec = 0;
  la.descendSec = 0;
  la.moveSec = 0;
  la.climbAnimAccum = 0;
  la.climbFrame = 0;
  la.animFrame = 0;
  la.newFloorApplied = false;
  la.startFeetScreenY = feetScreenY;
  la.startCenterScreenX = centerScreenX;
  la.endFeetScreenY = Number.NaN;
  la.endCenterScreenX = Number.NaN;
  t.phase = TransitionPhase.FADE_OUT;
  t.framesLeft = ROOM_FADE_FRAMES;
}

export type RoomTransitionTickResult =
  | "busy"
  | "done"
  | "swap"
  /** Fade-out finished for boss ascend — enter blackout and build next floor. */
  | "ascend_black"
  /** Blackout ready to apply next dungeon (caller builds + spawns). */
  | "ascend_apply"
  /** Blackout finished — begin fade-in on the new floor. */
  | "ascend_fade_in";

/**
 * Advance one fixed tick.
 * Caller handles side effects for swap / ascend_black / ascend_apply / ascend_fade_in.
 */
export function tickRoomTransition(
  t: RoomTransitionState,
  dt: number,
  climbAnimFps: number,
  climbSheetFrames: number,
): RoomTransitionTickResult {
  if (t.phase === TransitionPhase.LEVEL_LOAD_BLACK) {
    return tickLevelLoadBlack(t, dt, climbAnimFps, climbSheetFrames);
  }

  if (t.phase === TransitionPhase.NONE) {
    if (t.exitPoseHoldFrames > 0) {
      t.exitPoseHoldFrames--;
      if (t.exitPoseHoldFrames <= 0) {
        t.pose = DoorTransitionPose.NONE;
        t.horizontalDoor = false;
        return "done";
      }
      return "busy";
    }
    return "done";
  }

  // FADE_OUT / FADE_IN
  if (t.levelAscend.pending && t.phase === TransitionPhase.FADE_OUT) {
    const la = t.levelAscend;
    la.climbSec = Math.min(LEVEL_TRANS_CLIMB_SEC, la.climbSec + dt);
    tickClimbAnim(la, dt, climbAnimFps, climbSheetFrames);
  }

  t.framesLeft--;
  if (t.framesLeft > 0) return "busy";

  if (t.phase === TransitionPhase.FADE_OUT) {
    if (t.levelAscend.pending) {
      return "ascend_black";
    }
    return "swap";
  }

  // FADE_IN complete
  t.phase = TransitionPhase.NONE;
  t.framesLeft = 0;
  if (t.horizontalDoor) {
    t.pose = DoorTransitionPose.EXIT;
    t.exitPoseHoldFrames = DOOR_EXIT_POSE_HOLD_FRAMES;
    return "busy";
  }
  t.pose = DoorTransitionPose.NONE;
  return "done";
}

function tickLevelLoadBlack(
  t: RoomTransitionState,
  dt: number,
  climbAnimFps: number,
  climbSheetFrames: number,
): RoomTransitionTickResult {
  const la = t.levelAscend;
  la.blackRemaining -= dt;

  let result: RoomTransitionTickResult = "busy";
  if (!la.newFloorApplied) {
    result = "ascend_apply";
  }

  if (la.climbSec < LEVEL_TRANS_CLIMB_SEC - 1e-6) {
    la.climbSec = Math.min(LEVEL_TRANS_CLIMB_SEC, la.climbSec + dt);
    tickClimbAnim(la, dt, climbAnimFps, climbSheetFrames);
  } else if (la.newFloorApplied) {
    la.descendSec = Math.min(LEVEL_TRANS_DESCEND_SEC, la.descendSec + dt);
    tickDescendAnim(la);
  } else {
    tickClimbAnim(la, dt, climbAnimFps, climbSheetFrames);
  }

  if (la.newFloorApplied) {
    la.moveSec = Math.min(LEVEL_TRANS_MOVE_TOTAL_SEC, la.moveSec + dt);
  }

  const climbDone = la.climbSec >= LEVEL_TRANS_CLIMB_SEC - 1e-6;
  const descendDone = la.descendSec >= LEVEL_TRANS_DESCEND_SEC - 1e-6;
  const moveDone =
    la.newFloorApplied &&
    climbDone &&
    descendDone &&
    la.moveSec >= LEVEL_TRANS_MOVE_TOTAL_SEC - 1e-6;

  if (la.newFloorApplied && la.blackRemaining <= 0 && moveDone) {
    return "ascend_fade_in";
  }
  return result;
}

function tickClimbAnim(
  la: LevelAscendState,
  dt: number,
  climbAnimFps: number,
  climbSheetFrames: number,
): void {
  const frames = Math.max(1, climbSheetFrames);
  const fps = Math.max(0.05, climbAnimFps);
  la.climbAnimAccum += dt;
  const frameSec = 1 / fps;
  while (la.climbAnimAccum >= frameSec) {
    la.climbAnimAccum -= frameSec;
    la.climbFrame = (la.climbFrame + 1) % frames;
  }
}

function tickDescendAnim(la: LevelAscendState): void {
  const raw =
    LEVEL_TRANS_DESCEND_SEC <= 0 ? 1 : Math.min(1, la.descendSec / LEVEL_TRANS_DESCEND_SEC);
  const eased = smoothStep01(raw);
  la.animFrame = Math.min(
    LEVEL_TRANS_SHEET_FRAMES - 1,
    Math.floor(eased * LEVEL_TRANS_SHEET_FRAMES),
  );
}

export function smoothStep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function levelTransMoveEase(moveSec: number): number {
  if (LEVEL_TRANS_MOVE_TOTAL_SEC <= 0) return 1;
  return smoothStep01(Math.min(1, moveSec / LEVEL_TRANS_MOVE_TOTAL_SEC));
}

/** Enter blackout after ascend fade-out. */
export function beginLevelLoadBlack(t: RoomTransitionState): void {
  const la = t.levelAscend;
  t.phase = TransitionPhase.LEVEL_LOAD_BLACK;
  t.framesLeft = 0;
  la.blackRemaining = LEVEL_TRANSITION_MIN_BLACK_SEC;
  la.descendSec = 0;
  la.moveSec = 0;
  // Keep climbSec accumulated during fade-out.
}

/** Mark next floor applied and set end screen anchors. */
export function markLevelAscendFloorApplied(
  t: RoomTransitionState,
  endFeetScreenY: number,
  endCenterScreenX: number,
): void {
  const la = t.levelAscend;
  la.newFloorApplied = true;
  la.endFeetScreenY = endFeetScreenY;
  la.endCenterScreenX = endCenterScreenX;
}

/** Leave blackout into fade-in on the new floor. */
export function beginFadeInAfterAscend(t: RoomTransitionState): void {
  t.levelAscend.pending = false;
  t.phase = TransitionPhase.FADE_IN;
  t.framesLeft = ROOM_FADE_FRAMES;
  t.pose = DoorTransitionPose.NONE;
  t.horizontalDoor = false;
}

/** Call after applyRoomAndSpawn during fade-out → fade-in handoff. */
export function beginFadeInAfterSwap(t: RoomTransitionState): void {
  if (t.horizontalDoor) t.pose = DoorTransitionPose.EXIT;
  t.phase = TransitionPhase.FADE_IN;
  t.framesLeft = ROOM_FADE_FRAMES;
}

/** Overlay alpha 0..220 for current fade phase (0 when idle / exit-hold / blackout). */
export function roomFadeAlpha(t: RoomTransitionState): number {
  if (t.phase === TransitionPhase.LEVEL_LOAD_BLACK) return 0;
  if (t.phase === TransitionPhase.NONE || t.framesLeft < 0) return 0;
  const total = ROOM_FADE_FRAMES;
  if (total <= 0) return 0;
  let frac: number;
  if (t.phase === TransitionPhase.FADE_OUT) {
    frac = 1 - t.framesLeft / total;
  } else {
    frac = t.framesLeft / total;
  }
  return Math.round(ROOM_FADE_ALPHA_PEAK * Math.max(0, Math.min(1, frac)));
}

export function drawRoomFade(
  g: CanvasRenderingContext2D,
  t: RoomTransitionState,
  width: number,
  height: number,
): void {
  const a = roomFadeAlpha(t);
  if (a <= 0) return;
  g.fillStyle = `rgba(0,0,0,${a / 255})`;
  g.fillRect(0, 0, width, height);
}

/** Current draw feet/center in device space during ascend cinematic. */
export function levelAscendDrawAnchor(la: LevelAscendState): {
  feetY: number;
  centerX: number;
} {
  if (!la.newFloorApplied || Number.isNaN(la.endFeetScreenY)) {
    return { feetY: la.startFeetScreenY, centerX: la.startCenterScreenX };
  }
  const eased = levelTransMoveEase(la.moveSec);
  return {
    feetY: la.startFeetScreenY + (la.endFeetScreenY - la.startFeetScreenY) * eased,
    centerX: la.startCenterScreenX + (la.endCenterScreenX - la.startCenterScreenX) * eased,
  };
}

/** True while drawing climb composite (not yet on descend strip). */
export function levelAscendUsesClimbDraw(la: LevelAscendState): boolean {
  return la.climbSec < LEVEL_TRANS_CLIMB_SEC - 1e-6 || la.descendSec <= 0;
}

/** Strip handoff Y adjust in device px (eases out over descend). */
export function levelTransStripHandoffAdjustDevY(descendSec: number, cameraZoom: number): number {
  if (LEVEL_TRANS_DESCEND_SEC <= 0 || LEVEL_TRANS_STRIP_TOP_PAD_WORLD_PX <= 0) return 0;
  const t = Math.min(1, descendSec / LEVEL_TRANS_DESCEND_SEC);
  const remain = 1 - smoothStep01(t);
  return Math.round(remain * LEVEL_TRANS_STRIP_TOP_PAD_WORLD_PX * cameraZoom);
}
