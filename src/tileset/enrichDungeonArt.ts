import { resolveBiome } from "./NormalRoomBiomes";
import { placeAmbientDeco, placeStepBreakables } from "./placeAmbientDeco";
import type { TilesetProject } from "./TilesetProject";
import type { BuiltDungeon } from "../world/buildDungeon";
import type { GeneratedRoom, RoomArtData } from "../world/RoomGenerator";
import { RoomKind } from "../world/DungeonTypes";

/** Attach biome + deco + breakables once tileset is loaded (and after floor ascend). */
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
  // Java: NORMAL / BOSS only (not SECRET).
  if (room.kind === RoomKind.NORMAL || room.kind === RoomKind.BOSS) {
    placeStepBreakables(room.map, contentSeed, room.kind, {
      leftDoorX: room.leftDoorTileX,
      rightDoorX: room.rightDoorTileX,
      leftDoorTopY: room.leftDoorTopTileY,
      rightDoorTopY: room.rightDoorTopTileY,
      ladderTx: room.ladderColumnTx,
      maxReach: 3,
    });
  }
  const decoStamps = placeAmbientDeco(
    project,
    room.map,
    contentSeed,
    biome,
    room.ladderColumnTx,
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
