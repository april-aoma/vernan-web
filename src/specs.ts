/**
 * Authoritative display / timing constants — mirror docs/game-specs.md in the Java repo.
 * Update both sides when these change.
 */
export const TILE_SIZE = 16;
export const INTERNAL_WIDTH = 512;
export const INTERNAL_HEIGHT = 320;
export const WINDOW_SCALE = 2;
export const CAMERA_ZOOM = 2;
export const HUD_TILE_ROWS = 4;
export const HUD_HEIGHT = HUD_TILE_ROWS * TILE_SIZE; // 64
export const WORLD_VIEWPORT_W = INTERNAL_WIDTH / CAMERA_ZOOM; // 256
export const WORLD_VIEWPORT_H = INTERNAL_HEIGHT - HUD_HEIGHT; // 256
export const FIXED_STEP_HZ = 60;
export const FIXED_DT = 1 / FIXED_STEP_HZ;
export const DISPLAY_WIDTH = INTERNAL_WIDTH * WINDOW_SCALE; // 1024
export const DISPLAY_HEIGHT = INTERNAL_HEIGHT * WINDOW_SCALE; // 640

/** Player stand collision height / grounded spawn offset (game-specs). */
export const PLAYER_STAND_H = 18;
