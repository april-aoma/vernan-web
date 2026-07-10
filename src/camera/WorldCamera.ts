import {
  CAMERA_ZOOM,
  INTERNAL_WIDTH,
  TILE_SIZE,
  WORLD_VIEWPORT_H,
} from "../specs";
import {
  CAMERA_EDGE_BUFFER_WORLD,
  CAMERA_ENEMY_FOCUS_PAD_WORLD,
  CAMERA_H_DEAD_ZONE_FRAC,
  CAMERA_H_FACE_BIAS,
  CAMERA_H_FACE_VX_BIAS_OFF,
  CAMERA_H_FACE_VX_BIAS_ON,
  CAMERA_H_IDEAL_SMOOTH_TAU,
  CAMERA_H_MAX_SPEED,
  CAMERA_LADDER_BIAS_TAU_DECAY,
  CAMERA_LADDER_BIAS_TAU_HOLD,
  CAMERA_LADDER_BIAS_TAU_INPUT,
  CAMERA_LADDER_LOOK_FRAC_CAP,
  CAMERA_LADDER_LOOK_FRAC_FULL,
  CAMERA_LADDER_LOOK_FRAC_SHORT,
  CAMERA_LADDER_V_DEAD_ZONE_FRAC,
  CAMERA_LADDER_V_SPEED,
  CAMERA_V_DEAD_ZONE_FRAC,
  CAMERA_V_LANDING_BOOST_TIME,
  CAMERA_V_LANDING_SPEED_MULT,
  CAMERA_V_SPEED_AIR_DOWN,
  CAMERA_V_SPEED_AIR_UP,
  CAMERA_V_SPEED_GROUND,
} from "../config/Physics";
import type { TileMap } from "../world/TileMap";

export type CameraScrollBounds = {
  halfViewW: number;
  halfViewH: number;
  minAnchorX: number;
  maxAnchorX: number;
  minAnchorY: number;
  maxAnchorY: number;
  /** Edge buffer used by ladder shaft clamp (Java ScrollBounds.edgeBufferWorld). */
  edgeBufferWorld?: number;
};

/** Soft-chase inputs (Java SideScrollCamera.FollowInput). */
export type CameraFollowInput = {
  vx: number;
  vy: number;
  facing: number;
  onGround: boolean;
  wasOnGround: boolean;
  climbing?: boolean;
  inputUp?: boolean;
  inputDown?: boolean;
  ladderColumnValid?: boolean;
  ladderHighRow?: number;
  ladderLowRow?: number;
  viewWorldH?: number;
  tileSize?: number;
  focusMinX?: number;
  focusMaxX?: number;
  enemyFocusCount?: number;
  ladderEnemyBelowExtraWorld?: number;
};

export type CameraFollowOpts = {
  /** Fixed-step dt; when set with soft chase, uses dead-zone lag. */
  dt?: number;
  /** Override map-derived scroll limits (playable seam tuck). */
  bounds?: CameraScrollBounds;
  /** Soft chase kinematics; omit for hard snap (spawn / SEAM-ANIM pan). */
  soft?: CameraFollowInput;
};

/**
 * Side-scroll camera: soft dead-zone chase (Java SideScrollCamera) + hard snap for spawn/pan.
 */
export class WorldCamera {
  centerX = 0;
  centerY = 0;
  tx = 0;
  ty = 0;

  private landingEaseTimer = 0;
  private smoothedIdealX = 0;
  private ladderSmoothBias = 0;
  private faceBiasActive = false;

  reset(anchorX: number, anchorY: number): void {
    this.centerX = anchorX;
    this.centerY = anchorY;
    this.landingEaseTimer = 0;
    this.smoothedIdealX = anchorX;
    this.ladderSmoothBias = 0;
    this.faceBiasActive = false;
    this.publishTxTy();
  }

  /** Visible world half-extents (zoom 2 → 128×64 world px). */
  static halfViews(): { halfViewW: number; halfViewH: number } {
    return {
      halfViewW: INTERNAL_WIDTH / (2 * CAMERA_ZOOM),
      halfViewH: WORLD_VIEWPORT_H / (2 * CAMERA_ZOOM),
    };
  }

  /** Raw map scroll limits (no seam tuck). Prefer resolveCameraScrollBounds for gameplay. */
  static scrollBounds(map: TileMap): CameraScrollBounds {
    const { halfViewW, halfViewH } = WorldCamera.halfViews();
    const mapW = map.getWidth() * 16;
    const mapH = map.getHeight() * 16;
    const edge = CAMERA_EDGE_BUFFER_WORLD;
    return {
      halfViewW,
      halfViewH,
      minAnchorX: halfViewW,
      maxAnchorX: Math.max(halfViewW, mapW - halfViewW),
      minAnchorY: halfViewH + edge,
      maxAnchorY: Math.max(halfViewH + edge, mapH - halfViewH - edge),
      edgeBufferWorld: edge,
    };
  }

  /**
   * Follow anchors. With `opts.soft` + `opts.dt`, dead-zone chase; otherwise hard snap.
   * Always clamps to `opts.bounds` or map scrollBounds.
   */
  follow(anchorX: number, anchorY: number, map: TileMap, opts?: CameraFollowOpts): void {
    const b = opts?.bounds ?? WorldCamera.scrollBounds(map);
    const soft = opts?.soft;
    const dt = opts?.dt;

    if (soft != null && dt != null && dt > 0) {
      this.updateSoft(dt, b, anchorX, anchorY, soft);
    } else {
      this.centerX = clamp(anchorX, b.minAnchorX, b.maxAnchorX);
      this.centerY = clamp(anchorY, b.minAnchorY, b.maxAnchorY);
      this.smoothedIdealX = this.centerX;
    }
    this.publishTxTy();
  }

  private updateSoft(
    dt: number,
    b: CameraScrollBounds,
    anchorX: number,
    anchorY: number,
    soft: CameraFollowInput,
  ): void {
    const justLanded = !soft.wasOnGround && soft.onGround;
    if (justLanded) {
      this.landingEaseTimer = CAMERA_V_LANDING_BOOST_TIME;
    } else {
      this.landingEaseTimer = Math.max(0, this.landingEaseTimer - dt);
    }

    const climbingLadder = !!(soft.climbing && soft.ladderColumnValid);
    if (!climbingLadder) this.ladderSmoothBias = 0;

    const avx = Math.abs(soft.vx);
    if (this.faceBiasActive) {
      if (avx <= CAMERA_H_FACE_VX_BIAS_OFF) this.faceBiasActive = false;
    } else if (avx >= CAMERA_H_FACE_VX_BIAS_ON) {
      this.faceBiasActive = true;
    }

    let rawIdealX = anchorX;
    if (this.faceBiasActive) rawIdealX += soft.facing * CAMERA_H_FACE_BIAS;
    const clampedIdealX = clampIdealXForEnemyFocus(b, rawIdealX, soft);
    const alpha = 1 - Math.exp(-dt / Math.max(1e-4, CAMERA_H_IDEAL_SMOOTH_TAU));
    this.smoothedIdealX += (clampedIdealX - this.smoothedIdealX) * alpha;

    this.chaseHorizontal(b.halfViewW, this.smoothedIdealX, dt);

    if (climbingLadder) {
      this.ladderVertical(dt, b, soft, anchorY);
    } else {
      this.chaseVertical(dt, b, soft, anchorY);
    }

    this.centerX = clamp(this.centerX, b.minAnchorX, b.maxAnchorX);
    this.centerY = clamp(this.centerY, b.minAnchorY, b.maxAnchorY);
  }

  private chaseHorizontal(halfViewW: number, idealX: number, dt: number): void {
    const dead = halfViewW * CAMERA_H_DEAD_ZONE_FRAC;
    const diff = idealX - this.centerX;
    const step = CAMERA_H_MAX_SPEED * dt;
    if (diff > dead) {
      this.centerX += Math.min(diff - dead, step);
    } else if (diff < -dead) {
      this.centerX -= Math.min(-diff - dead, step);
    }
  }

  private chaseVertical(
    dt: number,
    b: CameraScrollBounds,
    soft: CameraFollowInput,
    idealY: number,
  ): void {
    const dead = b.halfViewH * CAMERA_V_DEAD_ZONE_FRAC;
    const diff = idealY - this.centerY;
    const vMult = this.landingEaseTimer > 0 ? CAMERA_V_LANDING_SPEED_MULT : 1;
    let speed: number;
    if (!soft.onGround) {
      speed = soft.vy < -30 ? CAMERA_V_SPEED_AIR_UP : CAMERA_V_SPEED_AIR_DOWN;
    } else {
      speed = CAMERA_V_SPEED_GROUND;
    }
    speed *= vMult;
    const step = speed * dt;
    if (diff > dead) {
      this.centerY += Math.min(diff - dead, step);
    } else if (diff < -dead) {
      this.centerY -= Math.min(-diff - dead, step);
    }
  }

  private ladderVertical(
    dt: number,
    b: CameraScrollBounds,
    soft: CameraFollowInput,
    anchorY: number,
  ): void {
    const viewH = soft.viewWorldH ?? b.halfViewH * 2;
    const hi = soft.ladderHighRow ?? 0;
    const lo = soft.ladderLowRow ?? 0;
    const ts = soft.tileSize ?? TILE_SIZE;

    const shaftH = (lo - hi + 1) * ts;
    const coverage = clamp(shaftH / Math.max(1e-6, viewH), 0, 1);
    let lookFrac = lerp(
      CAMERA_LADDER_LOOK_FRAC_SHORT,
      CAMERA_LADDER_LOOK_FRAC_FULL,
      coverage,
    );
    lookFrac = clamp(lookFrac, 0, CAMERA_LADDER_LOOK_FRAC_CAP);

    let manualBias = 0;
    if (soft.inputUp && !soft.inputDown) manualBias = -lookFrac * viewH;
    else if (soft.inputDown && !soft.inputUp) manualBias = lookFrac * viewH;

    const maxBias = CAMERA_LADDER_LOOK_FRAC_CAP * viewH;
    const enemyExtra = clamp(soft.ladderEnemyBelowExtraWorld ?? 0, 0, maxBias);

    const steering = !!(soft.inputUp || soft.inputDown);
    let targetBias: number;
    if (steering) targetBias = manualBias + enemyExtra;
    else if (enemyExtra > 1e-4) targetBias = enemyExtra;
    else targetBias = 0;

    const tau = steering
      ? CAMERA_LADDER_BIAS_TAU_INPUT
      : enemyExtra > 1e-4
        ? CAMERA_LADDER_BIAS_TAU_HOLD
        : CAMERA_LADDER_BIAS_TAU_DECAY;
    const beta = 1 - Math.exp(-dt / Math.max(1e-4, tau));
    this.ladderSmoothBias += (targetBias - this.ladderSmoothBias) * beta;
    this.ladderSmoothBias = clamp(this.ladderSmoothBias, -maxBias, maxBias);

    let idealY = anchorY + this.ladderSmoothBias;

    const shaftTop = hi * ts;
    const shaftBot = (lo + 1) * ts;
    const halfH = b.halfViewH;
    const buf = b.edgeBufferWorld ?? CAMERA_EDGE_BUFFER_WORLD;
    let cyMinShaft = shaftTop + halfH - buf;
    let cyMaxShaft = shaftBot - halfH + buf;
    if (cyMinShaft > cyMaxShaft) {
      const mid = (shaftTop + shaftBot) * 0.5;
      cyMinShaft = mid;
      cyMaxShaft = mid;
    }
    idealY = clamp(idealY, cyMinShaft, cyMaxShaft);
    idealY = clamp(idealY, b.minAnchorY, b.maxAnchorY);

    const diff = idealY - this.centerY;
    const dead = b.halfViewH * CAMERA_LADDER_V_DEAD_ZONE_FRAC;
    const step = CAMERA_LADDER_V_SPEED * dt;
    if (diff > dead) {
      this.centerY += Math.min(diff - dead, step);
    } else if (diff < -dead) {
      this.centerY -= Math.min(-diff - dead, step);
    }
  }

  private publishTxTy(): void {
    this.tx = Math.floor(INTERNAL_WIDTH / 2 - CAMERA_ZOOM * this.centerX);
    this.ty = Math.floor(WORLD_VIEWPORT_H / 2 - CAMERA_ZOOM * this.centerY);
  }

  worldToDeviceX(wx: number): number {
    return Math.floor(CAMERA_ZOOM * wx + this.tx);
  }

  worldToDeviceY(wy: number): number {
    return Math.floor(CAMERA_ZOOM * wy + this.ty);
  }

  /** Visible world rect corresponding to the world viewport (Java worldCameraVisibleRectWorld). */
  viewRect(): { x: number; y: number; w: number; h: number } {
    const { halfViewW, halfViewH } = WorldCamera.halfViews();
    return {
      x: this.centerX - halfViewW,
      y: this.centerY - halfViewH,
      w: halfViewW * 2,
      h: halfViewH * 2,
    };
  }
}

function clampIdealXForEnemyFocus(
  b: CameraScrollBounds,
  idealX: number,
  soft: CameraFollowInput,
): number {
  const count = soft.enemyFocusCount ?? 0;
  if (count <= 0) return idealX;
  const pad = CAMERA_ENEMY_FOCUS_PAD_WORLD;
  const focusMin = soft.focusMinX ?? idealX;
  const focusMax = soft.focusMaxX ?? idealX;
  const lowFeas = focusMax - b.halfViewW + pad;
  const highFeas = focusMin + b.halfViewW - pad;
  if (lowFeas > highFeas) return idealX;
  return clamp(idealX, lowFeas, highFeas);
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return (lo + hi) * 0.5;
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
