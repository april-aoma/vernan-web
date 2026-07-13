import type { VernanBodyPart } from "./VernanBodyPart";

/**
 * Letter-suffixed pose packs under a shared multi-frame body anim (e.g. bored + boredA / boredB).
 * Java game.vernan.VernanPosePack.
 */
export type VernanPosePack = "A" | "B";

export const VERNAN_POSE_PACKS: readonly VernanPosePack[] = ["A", "B"];

export function posePackAnimKey(parentAnimKey: string, pack: VernanPosePack): string {
  return `${parentAnimKey}${pack}`;
}

export function posePackParentAnimKey(animKey: string): string | null {
  if (animKey.length < 2) return null;
  const last = animKey.charAt(animKey.length - 1);
  if (last < "A" || last > "Z") return null;
  const before = animKey.charAt(animKey.length - 2);
  if (before < "a" || before > "z") return null;
  if (last !== "A" && last !== "B") return null;
  return animKey.slice(0, -1);
}

export function posePackFromAnimKey(animKey: string): VernanPosePack | null {
  const parent = posePackParentAnimKey(animKey);
  if (!parent) return null;
  const last = animKey.charAt(animKey.length - 1);
  return last === "A" || last === "B" ? last : null;
}

export function isPosePackKey(animKey: string): boolean {
  return posePackFromAnimKey(animKey) != null;
}

export function isPosePackPart(part: VernanBodyPart): boolean {
  return part === "face" || part === "hair" || part === "hat-hair";
}
