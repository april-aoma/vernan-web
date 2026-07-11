/** Resolved pluck destination for gardening gloves (Java PluckTarget). */
export type PluckTarget =
  | { kind: "grass"; tx: number; ty: number; decoTileId: string; objectId: string }
  | { kind: "breakable_floor"; tx: number; ty: number; hiddenShell: boolean }
  | { kind: "settled_fruit"; worldX: number; worldY: number }
  | { kind: "ice_block"; blockIndex: number };
