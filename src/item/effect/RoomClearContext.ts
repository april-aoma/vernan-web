import type { Player } from "../../entity/Player";

/** Combat room clear event for items like IRON_LUNG. */
export type RoomClearContext = {
  player: Player;
};
