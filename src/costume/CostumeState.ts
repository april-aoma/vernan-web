/**
 * Vernan body-anim states a costume layer can paint over (Java CostumeState).
 */
export type CostumeState =
  | "IDLE"
  | "WALK"
  | "SKATE"
  | "WALK_OFF_LEDGE"
  | "JUMP"
  | "CROUCH"
  | "SLIDE"
  | "CLIMB"
  | "WALLSLIDE"
  | "ATTACK"
  | "AIR_ATTACK"
  | "CROUCH_ATTACK"
  | "HEADBAND_CROUCH_ATTACK"
  | "HEADBAND_UP_ATTACK"
  | "HEADBAND_SIDE_ATTACK"
  | "HEAVY_ATTACK"
  | "AIR_HEAVY_ATTACK"
  | "SPECIAL_ATTACK"
  | "AIR_SPECIAL_ATTACK"
  | "HURT_AIR"
  | "GRABBED"
  | "TURN"
  | "ITEM"
  | "PLUCK"
  | "THROW"
  | "AIR_THROW"
  | "DOOR_ENTER"
  | "DOOR_EXIT"
  | "GETUP"
  | "AIR_DODGE"
  | "LEVEL_TRANSITION"
  | "BORED";

export type CostumeStateDef = {
  fileName: string;
  frameCount: number;
};

export const COSTUME_STATES: Record<CostumeState, CostumeStateDef> = {
  IDLE: { fileName: "idle", frameCount: 1 },
  WALK: { fileName: "walk", frameCount: 4 },
  SKATE: { fileName: "skate", frameCount: 4 },
  WALK_OFF_LEDGE: { fileName: "walk off ledge", frameCount: 4 },
  JUMP: { fileName: "jump", frameCount: 4 },
  CROUCH: { fileName: "crouch", frameCount: 1 },
  SLIDE: { fileName: "slide", frameCount: 1 },
  CLIMB: { fileName: "climb", frameCount: 2 },
  WALLSLIDE: { fileName: "wallslide", frameCount: 2 },
  ATTACK: { fileName: "attack", frameCount: 4 },
  AIR_ATTACK: { fileName: "air attack", frameCount: 4 },
  CROUCH_ATTACK: { fileName: "crouch attack", frameCount: 4 },
  HEADBAND_CROUCH_ATTACK: { fileName: "crouchattack1", frameCount: 4 },
  HEADBAND_UP_ATTACK: { fileName: "upattack0", frameCount: 7 },
  HEADBAND_SIDE_ATTACK: { fileName: "sideattack0", frameCount: 6 },
  HEAVY_ATTACK: { fileName: "heavy attack", frameCount: 8 },
  AIR_HEAVY_ATTACK: { fileName: "air heavy attack", frameCount: 8 },
  SPECIAL_ATTACK: { fileName: "special attack", frameCount: 5 },
  AIR_SPECIAL_ATTACK: { fileName: "air special attack", frameCount: 5 },
  HURT_AIR: { fileName: "hurt air", frameCount: 6 },
  GRABBED: { fileName: "grabbed", frameCount: 4 },
  TURN: { fileName: "turn", frameCount: 1 },
  ITEM: { fileName: "item", frameCount: 1 },
  PLUCK: { fileName: "pluck", frameCount: 4 },
  THROW: { fileName: "throw", frameCount: 5 },
  AIR_THROW: { fileName: "throw", frameCount: 5 },
  DOOR_ENTER: { fileName: "doorenter", frameCount: 1 },
  DOOR_EXIT: { fileName: "doorexit", frameCount: 1 },
  GETUP: { fileName: "getup", frameCount: 1 },
  AIR_DODGE: { fileName: "airdodge", frameCount: 3 },
  LEVEL_TRANSITION: { fileName: "leveltransition", frameCount: 11 },
  BORED: { fileName: "bored", frameCount: 6 },
};

export const ALL_COSTUME_STATES = Object.keys(COSTUME_STATES) as CostumeState[];

export function groundedCostumeFallback(state: CostumeState): CostumeState | null {
  switch (state) {
    case "AIR_ATTACK":
      return "ATTACK";
    case "AIR_SPECIAL_ATTACK":
      return "SPECIAL_ATTACK";
    case "AIR_THROW":
      return "THROW";
    case "AIR_HEAVY_ATTACK":
      return "HEAVY_ATTACK";
    default:
      return null;
  }
}
