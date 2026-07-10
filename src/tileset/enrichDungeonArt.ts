import { resolveBiome } from "./NormalRoomBiomes";
import { placeAmbientDeco, regroundDecoStampsToFinalTerrain } from "./placeAmbientDeco";
import {
  applyContextThemeFlankBake,
  parseContextThemeRules,
} from "./ContextThemeSubstitution";
import type { TilesetProject } from "./TilesetProject";
import type { BuiltDungeon } from "../world/buildDungeon";
import type { GeneratedRoom, RoomArtData } from "../world/RoomGenerator";

/**
 * Attach biome + deco once tileset is loaded (and after floor ascend).
 * Stamps after final terrain (seams/keyblocks already applied in buildDungeon).
 * Idempotent: skips re-stamp when art.decoStamps already present (regrounds only).
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
    room.art.decoStamps = stamps;
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
  const art: RoomArtData = {
    biomeId: biome.biomeId,
    sheetId: biome.sheetId,
    decoStamps,
    bridge: biome.bridge,
    contextThemeRules: themeRules,
  };
  room.art = art;
  return art;
}
