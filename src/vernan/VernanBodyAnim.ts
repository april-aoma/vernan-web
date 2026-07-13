import type { CostumeState } from "../costume/CostumeState";

/**
 * Folder prefix under sprites/vernan/ (Java VernanBodyAnim).
 */
export type VernanBodyAnimDef = {
  folderPrefix: string;
  frameCount: number;
  costumeState: CostumeState;
};

export const VERNAN_BODY_ANIMS: VernanBodyAnimDef[] = [
  { folderPrefix: "idle", frameCount: 1, costumeState: "IDLE" },
  { folderPrefix: "walk", frameCount: 4, costumeState: "WALK" },
  { folderPrefix: "skate", frameCount: 4, costumeState: "SKATE" },
  { folderPrefix: "crouch", frameCount: 1, costumeState: "CROUCH" },
  { folderPrefix: "slide", frameCount: 1, costumeState: "SLIDE" },
  { folderPrefix: "jump", frameCount: 4, costumeState: "JUMP" },
  { folderPrefix: "climb", frameCount: 2, costumeState: "CLIMB" },
  { folderPrefix: "wallslide", frameCount: 2, costumeState: "WALLSLIDE" },
  { folderPrefix: "turn", frameCount: 1, costumeState: "TURN" },
  { folderPrefix: "hurt", frameCount: 6, costumeState: "HURT_AIR" },
  { folderPrefix: "grabbed", frameCount: 4, costumeState: "GRABBED" },
  { folderPrefix: "item", frameCount: 1, costumeState: "ITEM" },
  { folderPrefix: "attack0", frameCount: 4, costumeState: "ATTACK" },
  { folderPrefix: "attack1", frameCount: 8, costumeState: "HEAVY_ATTACK" },
  { folderPrefix: "crouchattack0", frameCount: 4, costumeState: "CROUCH_ATTACK" },
  { folderPrefix: "crouchattack1", frameCount: 4, costumeState: "HEADBAND_CROUCH_ATTACK" },
  { folderPrefix: "upattack0", frameCount: 7, costumeState: "HEADBAND_UP_ATTACK" },
  { folderPrefix: "sideattack0", frameCount: 6, costumeState: "HEADBAND_SIDE_ATTACK" },
  { folderPrefix: "specialattack0", frameCount: 5, costumeState: "SPECIAL_ATTACK" },
  { folderPrefix: "pluck", frameCount: 4, costumeState: "PLUCK" },
  { folderPrefix: "throw", frameCount: 5, costumeState: "THROW" },
  { folderPrefix: "doorenter", frameCount: 1, costumeState: "DOOR_ENTER" },
  { folderPrefix: "doorexit", frameCount: 1, costumeState: "DOOR_EXIT" },
  { folderPrefix: "getup", frameCount: 1, costumeState: "GETUP" },
  { folderPrefix: "airdodge", frameCount: 3, costumeState: "AIR_DODGE" },
  { folderPrefix: "leveltransition", frameCount: 11, costumeState: "LEVEL_TRANSITION" },
  /** Sit / leg-swing idle; hair+face from boredA/boredB pose packs. */
  { folderPrefix: "bored", frameCount: 6, costumeState: "BORED" },
];

const BY_COSTUME_STATE = new Map<CostumeState, VernanBodyAnimDef>();
for (const anim of VERNAN_BODY_ANIMS) {
  BY_COSTUME_STATE.set(anim.costumeState, anim);
}

/** Extra mappings for costume states sharing anim keys. */
BY_COSTUME_STATE.set("WALK_OFF_LEDGE", BY_COSTUME_STATE.get("WALK")!);
BY_COSTUME_STATE.set("AIR_ATTACK", BY_COSTUME_STATE.get("ATTACK")!);
BY_COSTUME_STATE.set("AIR_SPECIAL_ATTACK", BY_COSTUME_STATE.get("SPECIAL_ATTACK")!);
BY_COSTUME_STATE.set("AIR_THROW", BY_COSTUME_STATE.get("THROW")!);
BY_COSTUME_STATE.set("AIR_HEAVY_ATTACK", BY_COSTUME_STATE.get("HEAVY_ATTACK")!);

export function vernanBodyAnimForCostumeState(state: CostumeState): VernanBodyAnimDef | null {
  return BY_COSTUME_STATE.get(state) ?? null;
}

export function expectedFrameCountForAnimKey(animKey: string): number {
  const anim = VERNAN_BODY_ANIMS.find((a) => a.folderPrefix === animKey);
  return anim?.frameCount ?? 1;
}
