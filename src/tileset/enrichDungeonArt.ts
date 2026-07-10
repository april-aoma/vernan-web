import { resolveBiome } from "./NormalRoomBiomes";
import { placeAmbientDeco } from "./placeAmbientDeco";
import type { TilesetProject } from "./TilesetProject";
import type { BuiltDungeon } from "../world/buildDungeon";
import type { GeneratedRoom, RoomArtData } from "../world/RoomGenerator";

/** Attach biome + deco once tileset is loaded (and after floor ascend).
 * Step breakables are placed in RoomGenerator.generate (not here) to match Java. */
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
  const decoStamps = placeAmbientDeco(
    project,
    room.map,
    contentSeed,
    biome,
    room.ladderColumnTx,
    floorOrdinal,
  );
  const art: RoomArtData = {
    biomeId: biome.biomeId,
    sheetId: biome.sheetId,
    decoStamps,
    bridge: biome.bridge,
  };
  room.art = art;
  return art;
}
