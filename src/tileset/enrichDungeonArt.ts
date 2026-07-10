import { resolveBiome } from "./NormalRoomBiomes";
import { placeAmbientDeco, regroundDecoStampsToFinalTerrain } from "./placeAmbientDeco";
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
import type { PlacedRoomObject } from "../world/PlacedRoomObject";

/**
 * Attach biome + deco + placed props once tileset is loaded (and after floor ascend).
 * Stamps after final terrain (seams/keyblocks already applied in buildDungeon).
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
    let stamps = regroundDecoStampsToFinalTerrain(
      room.art.decoStamps,
      room.map,
      room.ladderColumnTx,
    );
    stamps = applyContextThemeFlankBake(
      stamps,
      room.map,
      biome.bridge,
      contentSeed,
      room.kind,
      themeRules,
      tileAllowed,
    );
    const placed = placeAndEvict(room, project, contentSeed, floorOrdinal, stamps);
    room.art.decoStamps = stamps;
    room.art.placedRoomObjects = placed;
    room.art.biomeId = biome.biomeId;
    room.art.sheetId = biome.sheetId;
    room.art.bridge = biome.bridge;
    room.art.contextThemeRules = themeRules;
    return room.art;
  }

  let decoStamps = placeAmbientDeco(
    project,
    room.map,
    contentSeed,
    biome,
    room.ladderColumnTx,
    floorOrdinal,
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
  const placedRoomObjects = placeAndEvict(
    room,
    project,
    contentSeed,
    floorOrdinal,
    decoStamps,
  );
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

function placeAndEvict(
  room: GeneratedRoom,
  project: TilesetProject,
  contentSeed: bigint,
  floorOrdinal: number,
  decoStamps: Array<{ tx: number; ty: number }>,
): PlacedRoomObject[] {
  const placed = placeProceduralPlacedProps(
    project,
    room.map,
    room.kind,
    contentSeed,
    room.ladderColumnTx,
    floorOrdinal,
  );
  if (placed.length) {
    evictDecoOverlappingPlacedProps(decoStamps, placed);
  }
  return placed;
}
