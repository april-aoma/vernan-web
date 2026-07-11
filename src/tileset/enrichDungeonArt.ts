import {
  applyAmbientDecoPlacementRules,
  dropIncompletePackagedFootprints,
  placeAmbientDecoClusters,
  placeRoomKindDecoOverlays,
  refreshGroundHuggingFlags,
  regroundDecoStampsToFinalTerrain,
  regroundPackagedDeco,
  scatterEligibleGroundDeco,
} from "./placeAmbientDeco";
import { resolveBiome } from "./NormalRoomBiomes";
import {
  applyContextThemeFlankBake,
  parseContextThemeRules,
} from "./ContextThemeSubstitution";
import {
  evictDecoOverlappingPlacedProps,
  placeProceduralPlacedProps,
} from "./placeProceduralPlacedProps";
import type { TilesetProject } from "./TilesetProject";
import type { BuiltDungeon } from "../world/buildDungeon";
import type { GeneratedRoom, RoomArtData } from "../world/RoomGenerator";
import { regroundItemPedestal } from "../world/RoomGenerator";

/**
 * Attach biome + deco + placed props once tileset is loaded (and after floor ascend).
 * Order mirrors Java: ambient clusters → placed props → DecoPlacementRules.apply
 * (spawn surface / spawnWeight / preferAdjacent / preferAbove) → ground scatter →
 * drop incomplete packaged footprints → refresh ground-hugging → flank bake →
 * evict deco under props.
 * Idempotent: skips re-stamp when art.decoStamps already present (regrounds only);
 * still re-places props when pools are empty / missing so art stays consistent.
 */
export function enrichDungeonArt(
  dungeon: BuiltDungeon,
  project: TilesetProject,
  contentSeeds: bigint[],
): void {
  for (let i = 0; i < dungeon.rooms.length; i++) {
    const room = dungeon.rooms[i]!;
    const seed = contentSeeds[i] ?? 0n;
    enrichRoomArt(room, project, seed, dungeon.floorOrdinal);
  }
}

export function enrichRoomArt(
  room: GeneratedRoom,
  project: TilesetProject,
  contentSeed: bigint,
  floorOrdinal: number,
): RoomArtData {
  const biome = resolveBiome(project, room.kind, contentSeed, floorOrdinal);
  const themeRules = parseContextThemeRules(project, biome.contextThemeRules);
  const tileAllowed = (id: string) => project.tileAllowed(id, floorOrdinal, room.kind);

  if (room.art?.decoStamps?.length) {
    regroundItemPedestal(room);
    let stamps = regroundDecoStampsToFinalTerrain(
      room.art.decoStamps,
      room.map,
      room.ladderColumnTx,
      project,
    );
    stamps = refreshGroundHuggingFlags(stamps, room.map);
    stamps = regroundPackagedDeco(stamps, project, room.map, room.ladderColumnTx);
    stamps = dropIncompletePackagedFootprints(stamps, project);
    stamps = applyContextThemeFlankBake(
      stamps,
      room.map,
      biome.bridge,
      contentSeed,
      room.kind,
      themeRules,
      tileAllowed,
    );
    // Place once (empty array = already attempted with empty pools).
    let placed = room.art.placedRoomObjects;
    if (placed == null) {
      placed = placeProceduralPlacedProps(
        project,
        room.map,
        room.kind,
        contentSeed,
        room.ladderColumnTx,
        floorOrdinal,
      );
      if (placed.length) {
        evictDecoOverlappingPlacedProps(stamps, placed);
      }
    }
    room.art.decoStamps = stamps;
    room.art.placedRoomObjects = placed;
    room.art.biomeId = biome.biomeId;
    room.art.sheetId = biome.sheetId;
    room.art.bridge = biome.bridge;
    room.art.contextThemeRules = themeRules;
    return room.art;
  }

  // Java order: clusters → props → apply (spawn/adjacent/prefer-above) → scatter → cleanup.
  let decoStamps = placeAmbientDecoClusters(
    project,
    room.map,
    contentSeed,
    biome,
    room.ladderColumnTx,
    floorOrdinal,
    room.kind,
  );
  const placedRoomObjects = placeProceduralPlacedProps(
    project,
    room.map,
    room.kind,
    contentSeed,
    room.ladderColumnTx,
    floorOrdinal,
  );
  decoStamps = applyAmbientDecoPlacementRules(
    decoStamps,
    project,
    room.map,
    contentSeed,
    {
      placed: placedRoomObjects,
      bridge: biome.bridge,
      roomKind: room.kind,
      floorOrdinal,
    },
  );
  decoStamps = placeRoomKindDecoOverlays(
    decoStamps,
    project,
    room.map,
    room.kind,
    contentSeed,
    room.ladderColumnTx,
    biome,
    floorOrdinal,
  );
  decoStamps = scatterEligibleGroundDeco(
    project,
    room.map,
    contentSeed,
    decoStamps,
    room.ladderColumnTx,
    floorOrdinal,
    {
      placed: placedRoomObjects,
      bridge: biome.bridge,
      roomKind: room.kind,
      floorOrdinal,
      decoPool: biome.decoPool,
      exclusiveNormalPools: biome.exclusive,
    },
  );
  decoStamps = dropIncompletePackagedFootprints(decoStamps, project);
  decoStamps = regroundPackagedDeco(decoStamps, project, room.map, room.ladderColumnTx);
  decoStamps = refreshGroundHuggingFlags(decoStamps, room.map);
  decoStamps = regroundDecoStampsToFinalTerrain(
    decoStamps,
    room.map,
    room.ladderColumnTx,
    project,
  );
  decoStamps = applyContextThemeFlankBake(
    decoStamps,
    room.map,
    biome.bridge,
    contentSeed,
    room.kind,
    themeRules,
    tileAllowed,
  );
  if (placedRoomObjects.length) {
    evictDecoOverlappingPlacedProps(decoStamps, placedRoomObjects);
  }
  regroundItemPedestal(room);

  const art: RoomArtData = {
    biomeId: biome.biomeId,
    sheetId: biome.sheetId,
    decoStamps,
    placedRoomObjects,
    bridge: biome.bridge,
    contextThemeRules: themeRules,
  };
  room.art = art;
  return art;
}
