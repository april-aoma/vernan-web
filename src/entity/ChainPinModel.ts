/** Nephilim joint-pin vocabulary — port of Java ChainPinModel. */

export const PARENT = "parent";
export const CHILD = "child";
export const IK = "IK";

const CONNECTORS = new Set(["neck", "armL", "armR", "connFootL", "connFootR"]);

export type ChainLink = { partA: string; pinA: string; partB: string; pinB: string };
export type LimbChain = { bodySocket: string; connector: string; extremity: string };

export const NEPHILIM_LIMBS: readonly LimbChain[] = [
  { bodySocket: "socketNeck", connector: "neck", extremity: "head" },
  { bodySocket: "socketHandL", connector: "armL", extremity: "handL" },
  { bodySocket: "socketHandR", connector: "armR", extremity: "handR" },
];

export const NEPHILIM_LEG_CHAINS: readonly LimbChain[] = [
  { bodySocket: "socketFootL", connector: "connFootL", extremity: "footL" },
  { bodySocket: "socketFootR", connector: "connFootR", extremity: "footR" },
];

const NEPHILIM_ARM_HEAD_LINKS: readonly ChainLink[] = [
  { partA: "body", pinA: "socketNeck", partB: "neck", pinB: PARENT },
  { partA: "neck", pinA: CHILD, partB: "head", pinB: PARENT },
  { partA: "body", pinA: "socketHandL", partB: "armL", pinB: PARENT },
  { partA: "armL", pinA: CHILD, partB: "handL", pinB: PARENT },
  { partA: "body", pinA: "socketHandR", partB: "armR", pinB: PARENT },
  { partA: "armR", pinA: CHILD, partB: "handR", pinB: PARENT },
];

const NEPHILIM_LEG_LINKS: readonly ChainLink[] = [
  { partA: "body", pinA: "socketFootL", partB: "connFootL", pinB: PARENT },
  { partA: "connFootL", pinA: CHILD, partB: "footL", pinB: PARENT },
  { partA: "body", pinA: "socketFootR", partB: "connFootR", pinB: PARENT },
  { partA: "connFootR", pinA: CHILD, partB: "footR", pinB: PARENT },
];

export const NEPHILIM_LINKS: readonly ChainLink[] = [...NEPHILIM_ARM_HEAD_LINKS, ...NEPHILIM_LEG_LINKS];

export const MIN_CONNECTOR_BONE_SPAN = 4.0;

export function isConnector(partName: string): boolean {
  return CONNECTORS.has(normalizePartName(partName));
}

export function usesThinParentThickChild(partName: string): boolean {
  switch (normalizePartName(partName)) {
    case "armL":
    case "armR":
    case "thighL":
    case "thighR":
    case "connFootL":
    case "connFootR":
      return true;
    default:
      return false;
  }
}

export function usesThickParentThinChild(partName: string): boolean {
  return normalizePartName(partName) === "neck";
}

export function isHandGrabPin(partName: string, pin: string): boolean {
  const n = normalizePartName(partName);
  return (n === "handL" || n === "handR") && CHILD === normalizePinRole(partName, pin);
}

export function isFootPlantPin(partName: string, pin: string): boolean {
  const n = normalizePartName(partName);
  return (n === "footL" || n === "footR") && CHILD === normalizePinRole(partName, pin);
}

export function normalizePartName(partName: string): string {
  switch (partName) {
    case "connNeck":
      return "neck";
    case "connHandL":
      return "armL";
    case "connHandR":
      return "armR";
    default:
      return partName;
  }
}

export function normalizePinRole(partName: string, role: string): string {
  if (!role) return role;
  const part = normalizePartName(partName);
  switch (`${part}/${role}`) {
    case "body/neck":
    case "body/outNeck":
      return "socketNeck";
    case "body/handL":
    case "body/outHandL":
      return "socketHandL";
    case "body/handR":
    case "body/outHandR":
      return "socketHandR";
    case "body/footL":
    case "body/outFootL":
      return "socketFootL";
    case "body/footR":
    case "body/outFootR":
      return "socketFootR";
    case "neck/in":
    case "armL/in":
    case "armR/in":
    case "connNeck/parent":
    case "connHandL/parent":
    case "connHandR/parent":
    case "connFootL/parent":
    case "connFootR/parent":
      return PARENT;
    case "neck/out":
    case "armL/out":
    case "armR/out":
    case "connNeck/child":
    case "connHandL/child":
    case "connHandR/child":
    case "connFootL/child":
    case "connFootR/child":
      return CHILD;
    case "head/neck":
    case "head/in":
      return PARENT;
    case "handL/out":
    case "handR/out":
    case "handL/IK":
    case "handR/IK":
      return CHILD;
    default:
      return role;
  }
}

export function defaultPin(partName: string, pin: string): [number, number] {
  const part = normalizePartName(partName);
  const norm = normalizePinRole(partName, pin);
  switch (`${part}/${norm}`) {
    case "body/socketNeck":
      return [0, -4];
    case "body/socketHandL":
      return [-5, -1];
    case "body/socketHandR":
      return [5, -1];
    case "body/socketFootL":
      return [-3, 3];
    case "body/socketFootR":
      return [3, 3];
    case "neck/parent":
      return [0, 5];
    case "neck/child":
      return [0, -6];
    case "armL/parent":
    case "armR/parent":
      return [0, -5];
    case "armL/child":
    case "armR/child":
      return [0, 5];
    case "connFootL/parent":
    case "connFootR/parent":
      return [0, -5];
    case "connFootL/child":
    case "connFootR/child":
      return [0, 5];
    case "head/parent":
      return [0, 6];
    case "head/child":
      return [-10, 10];
    case "handL/parent":
    case "handR/parent":
      return [0, -6];
    case "handL/child":
    case "handR/child":
      return [0, 6];
    case "footL/parent":
    case "footR/parent":
      return [0, -4];
    case "footL/child":
    case "footR/child":
      return [0, 7];
    default:
      return [0, 0];
  }
}

export function normalizeAttachMap(
  partName: string,
  raw: Record<string, [number, number]> | null | undefined,
): Record<string, [number, number]> {
  if (!raw || Object.keys(raw).length === 0) return {};
  const part = normalizePartName(partName);
  const out: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[normalizePinRole(part, k)] = v;
  }
  return out;
}

export function lookupPin(
  attach: Record<string, [number, number]> | null | undefined,
  partName: string,
  pin: string,
): [number, number] {
  const part = normalizePartName(partName);
  const norm = normalizePinRole(part, pin);
  if (attach) {
    const v = attach[norm] ?? attach[pin];
    if (v && v.length >= 2) return [v[0], v[1]];
  }
  return defaultPin(part, norm);
}

function pinSpan(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function connectorPinsUsable(partName: string, parent: [number, number], child: [number, number]): boolean {
  if (pinSpan(parent, child) < MIN_CONNECTOR_BONE_SPAN) return false;
  for (const p of [parent, child]) {
    if (Math.abs(p[0]) > 12 || Math.abs(p[1]) > 12) return false;
  }
  if (usesThinParentThickChild(partName) && parent[1] >= child[1] - 0.5) return false;
  if (usesThickParentThinChild(partName) && parent[1] <= child[1] + 0.5) return false;
  return true;
}

function averageXAtY(flat: ReadonlyArray<number>, targetY: number): number {
  let sumX = 0;
  let n = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    if (Math.abs(flat[i + 1]! - targetY) < 1.5) {
      sumX += flat[i]!;
      n++;
    }
  }
  return n > 0 ? sumX / n : flat[0]!;
}

function connectorEndpointsFromHurtHull(
  partName: string,
  hurt: ReadonlyArray<number>,
  pivotX: number,
  pivotY: number,
): [[number, number], [number, number]] | null {
  if (hurt.length < 4) return null;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < hurt.length; i += 2) {
    minY = Math.min(minY, hurt[i]!);
    maxY = Math.max(maxY, hurt[i]!);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY - minY < MIN_CONNECTOR_BONE_SPAN * 0.5) {
    return null;
  }
  const thinX = averageXAtY(hurt, minY);
  const thickX = averageXAtY(hurt, maxY);
  const thin: [number, number] = [thinX - pivotX, minY - pivotY];
  const thick: [number, number] = [thickX - pivotX, maxY - pivotY];
  if (usesThinParentThickChild(partName)) return [thin, thick];
  if (usesThickParentThinChild(partName)) return [thick, thin];
  return null;
}

/** Reliable parent/child pins for frame-2 connectors. */
export function effectiveConnectorEndpoints(
  partName: string,
  chainAttach: Record<string, [number, number]> | null | undefined,
  hurt: ReadonlyArray<number>,
  pivotX: number,
  pivotY: number,
): [[number, number], [number, number]] {
  const part = normalizePartName(partName);
  const parent = lookupPin(chainAttach, part, PARENT);
  const child = lookupPin(chainAttach, part, CHILD);
  if (connectorPinsUsable(part, parent, child)) return [parent, child];
  const fromHull = connectorEndpointsFromHurtHull(part, hurt, pivotX, pivotY);
  if (fromHull) return fromHull;
  return [defaultPin(part, PARENT), defaultPin(part, CHILD)];
}
