import type { DecoStamp } from "./placeAmbientDeco";
import {
  buildPackagedDecoIndex,
  javaStringHash,
  type PackagedDecoIndex,
} from "./placeAmbientDeco";
import type { AutotileObject, DecoPlacementRule, TilesetProject } from "./TilesetProject";

/** Java DecoSupportLoss.UnsupportedReaction. */
export type UnsupportedReaction = "none" | "despawn" | "crumble";

export type InstanceImpact = {
  instanceKey: string;
  reaction: UnsupportedReaction;
  members: DecoStamp[];
};

/**
 * Ground-hugging deco that lost standable support when (removedTx, removedTy) was
 * destroyed (Java DecoSupportLoss.impactsForGroundRemoval).
 */
export function impactsForGroundRemoval(
  deco: DecoStamp[],
  removedTx: number,
  removedTy: number,
  project: TilesetProject,
): InstanceImpact[] {
  if (!deco.length) return [];
  const index = buildPackagedDecoIndex(project);
  const membersByKey = new Map<string, DecoStamp[]>();

  for (const d of deco) {
    if (!d.groundHugging) continue;
    const tid = d.tileId?.trim();
    if (!tid) continue;
    if (d.tx !== removedTx || d.ty + 1 !== removedTy) continue;
    const key = instanceKeyFor(d, tid, index);
    let list = membersByKey.get(key);
    if (!list) {
      list = [];
      membersByKey.set(key, list);
    }
    list.push(d);
  }
  if (!membersByKey.size) return [];

  const out: InstanceImpact[] = [];
  for (const [instanceKey, members] of membersByKey) {
    const sample = members[0]!;
    const tid = sample.tileId?.trim() ?? "";
    const owner = tid ? project.objectByTileId.get(tid) : undefined;
    const reaction = unsupportedReaction(project, tid, owner);
    if (reaction !== "none") {
      out.push({ instanceKey, reaction, members });
    }
  }
  return out;
}

export function removeInstances(
  deco: DecoStamp[],
  instanceKeys: Set<string>,
  project: TilesetProject,
): DecoStamp[] {
  if (!instanceKeys.size) return deco;
  const index = buildPackagedDecoIndex(project);
  return deco.filter((d) => {
    const tid = d.tileId?.trim();
    if (!tid) return true;
    return !instanceKeys.has(instanceKeyFor(d, tid, index));
  });
}

export function unsupportedReaction(
  project: TilesetProject,
  tileId: string,
  owner: AutotileObject | undefined,
): UnsupportedReaction {
  const rule = ruleForDecoTile(project, tileId);
  if (rule) {
    if (rule.crumbleWhenUnsupported) return "crumble";
    if (rule.despawnWhenUnsupported) return "despawn";
    return "none";
  }
  if (
    owner &&
    owner.canSpawnOnGround &&
    !owner.canSpawnInAir &&
    !owner.canHangFromCeiling &&
    !owner.canClingToWall
  ) {
    return "despawn";
  }
  return "none";
}

function ruleForDecoTile(
  project: TilesetProject,
  tileId: string,
): DecoPlacementRule | undefined {
  const tid = tileId.trim();
  if (!tid) return undefined;
  const direct = project.decoPlacementRules.get(tid);
  if (direct) return direct;
  const owner = project.objectByTileId.get(tid);
  if (!owner) return undefined;
  for (const mid of owner.tileIds) {
    const r = project.decoPlacementRules.get(mid);
    if (r) return r;
  }
  return project.decoPlacementRules.get(owner.id);
}

function instanceKeyFor(
  d: DecoStamp,
  tid: string,
  index: PackagedDecoIndex,
): string {
  const anchor = index.anchorByMemberTile.get(tid);
  if (anchor) {
    const variants = index.footprintsByAnchor.get(anchor);
    if (variants) {
      for (const foot of variants) {
        for (const c of foot) {
          if (c.tileId === tid) {
            return `${anchor}@${d.tx - c.dTx},${d.ty - c.dTy}`;
          }
        }
      }
    }
  }
  return `cell@${d.tx},${d.ty}`;
}

/** Java DecoSupportLoss.crumbleSeed. */
export function crumbleSeed(runSeed: bigint, roomId: number, d: DecoStamp): bigint {
  const tid = d.tileId ?? "";
  return (
    runSeed ^
    BigInt(d.tx) * 0x9e3779b1n ^
    BigInt(d.ty) * 0x85ebca77n ^
    BigInt(roomId) * 37n ^
    BigInt(javaStringHash(tid)) * 0xc2b2ae3dn ^
    0x5a7ecafeen
  );
}
