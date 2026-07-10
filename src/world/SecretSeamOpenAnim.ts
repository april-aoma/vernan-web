import {
  SEAM_ANIM_CAMERA_PAN_STEPS,
  SEAM_ANIM_STAGGER_FRAMES,
  SEAM_ANIM_VERTICAL_STAGGER_FRAMES,
} from "../config/Physics";
import { TILE_SIZE } from "../specs";
import type { DungeonLayout } from "./DungeonLayout";
import type { GeneratedRoom } from "./RoomGenerator";
import {
  SeamKind,
  type SecretSeam,
} from "./SecretEntrancePlacer";
import {
  TILE_BREAKABLE,
  TILE_DOOR,
  TILE_EMPTY,
  TILE_LADDER,
  TILE_PLATFORM,
  TILE_SOLID,
  type TileMap,
} from "./TileMap";
import * as VerticalSeamGeometry from "./VerticalSeamGeometry";

export type SeamOpenStep = {
  tx: number;
  ty: number;
  restoreTileId: number;
  countsTowardStagger: boolean;
  spawnChunks: boolean;
};

/**
 * Staggered secret-seam open (Java SecretSeamOpenAnim / SEAM-ANIM-1).
 * Horizontal: remaining BB tiles + 15-step camera pan. Vertical: shaft strip.
 */
export class SecretSeamOpenAnim {
  readonly seam: SecretSeam;
  readonly roomId: number;
  private readonly unlockSouthLadderShaft: boolean;
  private readonly steps: SeamOpenStep[];
  private nextStepIndex = 0;
  private framesUntilNext = 0;
  private cameraPanStepsRemaining: number;
  private readonly cameraPanStepsTotal: number;
  private readonly cameraStartX: number;
  private readonly cameraTargetX: number;
  private readonly staggerFrames: number;
  private finished = false;
  private stepSpawner: ((s: SeamOpenStep) => void) | null = null;

  private constructor(
    seam: SecretSeam,
    roomId: number,
    unlockSouthLadderShaft: boolean,
    steps: SeamOpenStep[],
    cameraStartX: number,
    cameraTargetX: number,
    cameraPanSteps: number,
  ) {
    this.seam = seam;
    this.roomId = roomId;
    this.unlockSouthLadderShaft = unlockSouthLadderShaft;
    this.steps = steps;
    this.cameraStartX = cameraStartX;
    this.cameraTargetX = cameraTargetX;
    this.cameraPanStepsTotal = cameraPanSteps;
    this.cameraPanStepsRemaining = cameraPanSteps;
    this.staggerFrames =
      seam.kind === SeamKind.VERTICAL_LADDER
        ? SEAM_ANIM_VERTICAL_STAGGER_FRAMES
        : SEAM_ANIM_STAGGER_FRAMES;
  }

  isFinished(): boolean {
    return this.finished;
  }

  setStepSpawner(spawner: (s: SeamOpenStep) => void): void {
    this.stepSpawner = spawner;
  }

  hasCameraPan(): boolean {
    return (
      this.cameraPanStepsTotal > 0 &&
      this.nextStepIndex >= this.steps.length &&
      this.cameraPanStepsRemaining > 0
    );
  }

  cameraXForStep(totalPanStepsDone = 0): number {
    if (this.cameraPanStepsTotal <= 0) return this.cameraTargetX;
    const done =
      this.cameraPanStepsTotal - this.cameraPanStepsRemaining + totalPanStepsDone;
    let t = Math.min(1, done / this.cameraPanStepsTotal);
    t = t * t * (3 - 2 * t);
    return this.cameraStartX + (this.cameraTargetX - this.cameraStartX) * t;
  }

  static findForBreakable(
    seams: SecretSeam[] | null | undefined,
    rid: number,
    tx: number,
    ty: number,
    mapHeightTiles: number,
  ): SecretSeam | null {
    if (seams == null) return null;
    let horizontal: SecretSeam | null = null;
    let vertical: SecretSeam | null = null;
    for (const s of seams) {
      if (s.isDone() || !s.isHiddenBreakable(rid, tx, ty)) continue;
      if (s.kind === SeamKind.VERTICAL_LADDER) vertical = s;
      else if (s.kind === SeamKind.HORIZONTAL_DOOR) horizontal = s;
    }
    if (vertical && horizontal) {
      if (
        vertical.isSouthFaceBreakable(mapHeightTiles, rid, tx, ty) ||
        vertical.isNorthFaceBreakable(mapHeightTiles, rid, tx, ty)
      ) {
        return vertical;
      }
      return horizontal;
    }
    return vertical ?? horizontal;
  }

  static begin(
    seam: SecretSeam,
    allSeams: SecretSeam[],
    layout: DungeonLayout,
    rooms: GeneratedRoom[],
    roomId: number,
    strikeTx: number,
    strikeTy: number,
    cameraAnchorX: number,
    cameraTargetX: number,
    cameraBottomWorldY: number,
    hudInsetWorldPx: number,
  ): SecretSeamOpenAnim {
    const queue: SeamOpenStep[] = [];
    if (seam.kind === SeamKind.HORIZONTAL_DOOR) {
      queueHorizontal(seam, roomId, strikeTx, strikeTy, queue);
      return new SecretSeamOpenAnim(
        seam,
        roomId,
        false,
        queue,
        cameraAnchorX,
        cameraTargetX,
        SEAM_ANIM_CAMERA_PAN_STEPS,
      );
    }
    const south = seam.isSouthFaceBreakable(
      rooms[roomId]!.map.getHeight(),
      roomId,
      strikeTx,
      strikeTy,
    );
    queueVertical(
      allSeams,
      layout,
      seam,
      rooms,
      roomId,
      strikeTx,
      strikeTy,
      queue,
      cameraBottomWorldY,
      hudInsetWorldPx,
    );
    return new SecretSeamOpenAnim(seam, roomId, south, queue, cameraAnchorX, cameraTargetX, 0);
  }

  /** Apply the struck breakable immediately (chunks handled by caller). */
  applyStrikeStepNow(rooms: GeneratedRoom[], strikeTx: number, strikeTy: number): void {
    if (this.seam.kind === SeamKind.HORIZONTAL_DOOR) {
      this.applyHorizontalStrikeNow(rooms, strikeTx, strikeTy);
      return;
    }
    for (let i = this.nextStepIndex; i < this.steps.length; i++) {
      const s = this.steps[i]!;
      if (s.tx === strikeTx && s.ty === strikeTy) {
        this.applyStep(rooms, s);
        this.nextStepIndex = i + 1;
        return;
      }
    }
  }

  private applyHorizontalStrikeNow(
    rooms: GeneratedRoom[],
    strikeTx: number,
    strikeTy: number,
  ): void {
    for (let i = 0; i < this.seam.breakableCount(); i++) {
      if (!this.seam.breakableIndexIsInRoom(i, this.roomId)) continue;
      if (this.seam.breakableTx(i) !== strikeTx || this.seam.breakableTy(i) !== strikeTy) {
        continue;
      }
      rooms[this.roomId]!.map.setTile(strikeTx, strikeTy, this.seam.breakableRestore(i));
      this.seam.markBreakableCleared(this.roomId, strikeTx, strikeTy);
      return;
    }
  }

  /** Apply due steps; returns true when the strip (and camera pan) is complete. */
  tick(
    layout: DungeonLayout,
    rooms: GeneratedRoom[],
    advanceTimeline: boolean,
    applyCameraPanStep: boolean,
  ): boolean {
    if (this.finished) return true;
    if (advanceTimeline) {
      if (this.framesUntilNext > 0) this.framesUntilNext--;
      while (this.framesUntilNext <= 0 && this.nextStepIndex < this.steps.length) {
        const s = this.steps[this.nextStepIndex++]!;
        this.applyStep(rooms, s);
        if (s.countsTowardStagger) {
          this.framesUntilNext = this.staggerFrames;
          break;
        }
      }
    }
    const stepsDone = this.nextStepIndex >= this.steps.length;
    if (applyCameraPanStep && stepsDone && this.cameraPanStepsRemaining > 0) {
      this.cameraPanStepsRemaining--;
    }
    const panDone =
      this.cameraPanStepsTotal <= 0 || this.cameraPanStepsRemaining <= 0;
    if (stepsDone && panDone) {
      this.seam.completeAnimatedOpen(
        layout,
        rooms,
        this.roomId,
        this.unlockSouthLadderShaft,
      );
      this.finished = true;
      return true;
    }
    return false;
  }

  finishInstant(layout: DungeonLayout, rooms: GeneratedRoom[]): void {
    while (this.nextStepIndex < this.steps.length) {
      this.applyStep(rooms, this.steps[this.nextStepIndex++]!);
    }
    this.seam.completeAnimatedOpen(
      layout,
      rooms,
      this.roomId,
      this.unlockSouthLadderShaft,
    );
    this.finished = true;
    this.cameraPanStepsRemaining = 0;
  }

  private applyStep(rooms: GeneratedRoom[], s: SeamOpenStep): void {
    if (this.stepSpawner && s.spawnChunks) this.stepSpawner(s);
    rooms[this.roomId]!.map.setTile(s.tx, s.ty, s.restoreTileId);
    this.seam.markBreakableCleared(this.roomId, s.tx, s.ty);
  }
}

function queueHorizontal(
  seam: SecretSeam,
  roomId: number,
  strikeTx: number,
  strikeTy: number,
  queue: SeamOpenStep[],
): void {
  const pending: SeamOpenStep[] = [];
  for (let i = 0; i < seam.breakableCount(); i++) {
    if (!seam.breakableIndexIsInRoom(i, roomId)) continue;
    const x = seam.breakableTx(i);
    const y = seam.breakableTy(i);
    if (x === strikeTx && y === strikeTy) continue;
    pending.push({
      tx: x,
      ty: y,
      restoreTileId: seam.breakableRestore(i),
      countsTowardStagger: true,
      spawnChunks: true,
    });
  }
  pending.sort((a, b) => a.ty - b.ty);
  queue.push(...pending);
}

function queueVertical(
  allSeams: SecretSeam[],
  layout: DungeonLayout,
  seam: SecretSeam,
  rooms: GeneratedRoom[],
  roomId: number,
  strikeTx: number,
  strikeTy: number,
  queue: SeamOpenStep[],
  cameraBottomWorldY: number,
  hudInsetWorldPx: number,
): void {
  const room = rooms[roomId]!;
  const map = room.map;
  const l = seam.ladderTxInRoom(roomId);
  if (l < 0) return;
  const mapH = map.getHeight();
  const northSeal = seam.isNorthFaceBreakable(mapH, roomId, strikeTx, strikeTy);
  const southSeal = seam.isSouthFaceBreakable(mapH, roomId, strikeTx, strikeTy);
  if (northSeal) {
    queue.push({
      tx: l,
      ty: strikeTy,
      restoreTileId: TILE_LADDER,
      countsTowardStagger: false,
      spawnChunks: false,
    });
    for (let capY = strikeTy - 1; capY >= 0; capY--) {
      if (isBreakableOwnedByOtherSeam(allSeams, seam, roomId, l, capY)) continue;
      const t = map.tileAt(l, capY);
      if (capY === 0 && (t === TILE_EMPTY || t === TILE_SOLID)) {
        const chunks = !tileFullyBelowHud(l, capY, cameraBottomWorldY, hudInsetWorldPx);
        queue.push({
          tx: l,
          ty: capY,
          restoreTileId: TILE_LADDER,
          countsTowardStagger: true,
          spawnChunks: chunks,
        });
      } else if (capY >= 1 && t === TILE_SOLID) {
        const chunks = !tileFullyBelowHud(l, capY, cameraBottomWorldY, hudInsetWorldPx);
        queue.push({
          tx: l,
          ty: capY,
          restoreTileId: TILE_LADDER,
          countsTowardStagger: true,
          spawnChunks: chunks,
        });
      }
    }
  } else if (southSeal) {
    queue.push({
      tx: l,
      ty: strikeTy,
      restoreTileId: TILE_LADDER,
      countsTowardStagger: false,
      spawnChunks: false,
    });
    const sealMouthRow = VerticalSeamGeometry.mouthRow(map, l);
    const openMouthRow = VerticalSeamGeometry.operationalSouthMouthRow(map, l);
    const bandStart = VerticalSeamGeometry.southSealedBandStartY(sealMouthRow);
    const ladderSouth = layout.room(roomId).ladderSouth;
    for (let y = bandStart; y < mapH - 1; y++) {
      if (y === strikeTy) continue;
      if (isBreakableOwnedByOtherSeam(allSeams, seam, roomId, l, y)) continue;
      const finalTile = finalSouthColumnTile(map, l, y, openMouthRow, bandStart, ladderSouth);
      if (finalTile < 0) continue;
      const t = map.tileAt(l, y);
      if (t !== TILE_SOLID && t !== TILE_BREAKABLE) continue;
      const belowHud = tileFullyBelowHud(l, y, cameraBottomWorldY, hudInsetWorldPx);
      queue.push({
        tx: l,
        ty: y,
        restoreTileId: finalTile,
        countsTowardStagger: true,
        spawnChunks: !belowHud,
      });
    }
  }
}

function isBreakableOwnedByOtherSeam(
  allSeams: SecretSeam[],
  self: SecretSeam,
  rid: number,
  tx: number,
  ty: number,
): boolean {
  for (const other of allSeams) {
    if (other === self || other.isDone()) continue;
    if (other.isHiddenBreakable(rid, tx, ty)) return true;
  }
  return false;
}

function finalSouthColumnTile(
  map: TileMap,
  l: number,
  y: number,
  openMouthRow: number,
  bandStart: number,
  ladderSouth: boolean,
): number {
  if (!ladderSouth) return -1;
  const h = map.getHeight();
  if (y === openMouthRow) {
    return map.tileAt(l, y) === TILE_DOOR ? -1 : TILE_PLATFORM;
  }
  if (y > openMouthRow && y < h - 1) return TILE_LADDER;
  if (y >= bandStart && y < openMouthRow) return TILE_LADDER;
  return -1;
}

function tileFullyBelowHud(
  _tx: number,
  ty: number,
  cameraBottomWorldY: number,
  hudInsetWorldPx: number,
): boolean {
  const top = ty * TILE_SIZE;
  return top >= cameraBottomWorldY - hudInsetWorldPx;
}
