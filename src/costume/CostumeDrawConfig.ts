import type { CostumeSlot } from "./CostumeSlot";

export type CostumeSlotsFile = {
  layers: Record<
    string,
    {
      slot?: string;
      parts?: Record<string, string>;
    }
  >;
};

export class CostumeDrawConfig {
  private static loaded = new CostumeDrawConfig(new Map(), new Map());

  constructor(
    private readonly defaultSlotByFolder: ReadonlyMap<string, CostumeSlot>,
    private readonly partSlotByFolder: ReadonlyMap<string, ReadonlyMap<string, CostumeSlot>>,
  ) {}

  static get(): CostumeDrawConfig {
    return CostumeDrawConfig.loaded;
  }

  static async load(fetchJson: () => Promise<CostumeSlotsFile>): Promise<CostumeDrawConfig> {
    try {
      const root = await fetchJson();
      const defaults = new Map<string, CostumeSlot>();
      const parts = new Map<string, Map<string, CostumeSlot>>();
      for (const [folder, layer] of Object.entries(root.layers ?? {})) {
        if (layer.slot) {
          const slot = parseSlot(layer.slot);
          if (slot) defaults.set(folder, slot);
        }
        if (layer.parts) {
          const partSlots = new Map<string, CostumeSlot>();
          for (const [token, slotName] of Object.entries(layer.parts)) {
            const slot = parseSlot(slotName);
            if (slot) partSlots.set(token, slot);
          }
          if (partSlots.size > 0) parts.set(folder, partSlots);
        }
      }
      CostumeDrawConfig.loaded = new CostumeDrawConfig(defaults, parts);
    } catch {
      CostumeDrawConfig.loaded = new CostumeDrawConfig(new Map(), new Map());
    }
    return CostumeDrawConfig.loaded;
  }

  defaultSlotForFolder(folderName: string, codeDefault: CostumeSlot): CostumeSlot {
    return this.defaultSlotByFolder.get(folderName) ?? codeDefault;
  }

  partSlotForFolder(folderName: string, partToken: string, codeDefault: CostumeSlot): CostumeSlot {
    const parts = this.partSlotByFolder.get(folderName);
    if (!parts) return codeDefault;
    return parts.get(partToken) ?? codeDefault;
  }
}

function parseSlot(name: string): CostumeSlot | null {
  const slots: CostumeSlot[] = [
    "BEHIND_BODY",
    "AFTER_BASE",
    "AFTER_LEGS",
    "AFTER_ARM",
    "AFTER_HAIR",
    "AFTER_FACE",
    "TOPMOST",
  ];
  return slots.includes(name as CostumeSlot) ? (name as CostumeSlot) : null;
}
