import { COSTUME_STATES, type CostumeState } from "./CostumeState";
import { vernanBodyAnimForCostumeState } from "../vernan/VernanBodyAnim";

export const COSTUME_ALL = "all";
export const COSTUME_LEMON_ALL = "l-all";

const AIR_VARIANT_PREFIX = "air-";

export function animKeyForCostumeState(state: CostumeState): string {
  if (state === "WALK_OFF_LEDGE") return COSTUME_STATES[state].fileName;
  const anim = vernanBodyAnimForCostumeState(state);
  if (anim) return anim.folderPrefix;
  return COSTUME_STATES[state].fileName;
}

export function variantPrefixForCostumeState(state: CostumeState): string {
  switch (state) {
    case "AIR_ATTACK":
    case "AIR_SPECIAL_ATTACK":
    case "AIR_THROW":
    case "AIR_HEAVY_ATTACK":
      return AIR_VARIANT_PREFIX;
    default:
      return "";
  }
}

export function normalizeLayerToken(layerToken: string): string {
  return layerToken === "(monolithic)" ? COSTUME_ALL : layerToken;
}

export function stripVariantPrefix(layerToken: string): string {
  let token = normalizeLayerToken(layerToken);
  for (const prefix of ["hold-", "l-", "b-", AIR_VARIANT_PREFIX]) {
    if (prefix && token.startsWith(prefix)) return token.slice(prefix.length);
  }
  return token;
}

function hasVariantPrefix(token: string): boolean {
  for (const prefix of ["hold-", "l-", "b-", AIR_VARIANT_PREFIX]) {
    if (prefix && token.startsWith(prefix)) return true;
  }
  return false;
}

export function layerTokenForState(state: CostumeState, layerToken: string): string {
  const token = normalizeLayerToken(layerToken);
  const prefix = variantPrefixForCostumeState(state);
  if (!prefix || token.startsWith(prefix) || hasVariantPrefix(token)) return token;
  return prefix + token;
}

export function fileStem(animKey: string, layerToken: string): string {
  return `${animKey} ${normalizeLayerToken(layerToken)}`;
}

/** Candidate relative paths under sprites/costume/<folder>/ (first existing wins at load). */
export function stripPathCandidates(
  folderName: string,
  state: CostumeState,
  layerToken: string,
): string[] {
  const token = normalizeLayerToken(layerToken);
  const animKey = animKeyForCostumeState(state);
  const variantToken = layerTokenForState(state, token);
  const base = `sprites/costume/${folderName}/`;
  const out: string[] = [];

  out.push(`${base}${fileStem(animKey, variantToken)}.png`);

  const legacyState = COSTUME_STATES[state].fileName;
  if (legacyState !== animKey) {
    out.push(`${base}${legacyState} ${token}.png`);
  }

  if (token === COSTUME_ALL) {
    const legacyAll = `${base}${legacyState} ${COSTUME_ALL}.png`;
    if (!out.includes(legacyAll)) out.push(legacyAll);
    out.push(`${base}${legacyState}.png`);
  }
  if (token === COSTUME_LEMON_ALL) {
    out.push(`${base}${legacyState} ${COSTUME_LEMON_ALL}.png`);
    out.push(`${base}${legacyState} lemon.png`);
  }

  return out;
}
