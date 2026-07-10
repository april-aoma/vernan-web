export enum RoomKind {
  START = 0,
  NORMAL = 1,
  ITEM = 2,
  SHOP = 3,
  BOSS = 4,
  SECRET = 5,
  SUPER_SECRET = 6,
}

export type RoomNode = {
  id: number;
  gridX: number;
  gridY: number;
  contentSeed: bigint;
  doorWest: boolean;
  doorEast: boolean;
  ladderNorth: boolean;
  ladderSouth: boolean;
  /** Shared ladder column; -1 if no vertical exits. */
  ladderColumnTx: number;
  kind: RoomKind;
};

export function isOneScreenRoomKind(k: RoomKind): boolean {
  return k !== RoomKind.NORMAL && k !== RoomKind.SECRET;
}

export function cellKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

export function graphDegree(r: RoomNode): number {
  return (
    (r.doorWest ? 1 : 0) +
    (r.doorEast ? 1 : 0) +
    (r.ladderNorth ? 1 : 0) +
    (r.ladderSouth ? 1 : 0)
  );
}
