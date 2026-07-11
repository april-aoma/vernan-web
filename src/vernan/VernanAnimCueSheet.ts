import { vernanAnimEntryFromMap, type VernanAnimEntry } from "./VernanAnimEntry";

/** Loads {@code data/vernan_anim_cues.json}. */
export class VernanAnimCueSheet {
  static readonly CURRENT_VERSION = 1;

  private constructor(
    readonly version: number,
    private readonly entries: ReadonlyMap<string, VernanAnimEntry>,
  ) {}

  get(logicalKey: string): VernanAnimEntry | undefined {
    return this.entries.get(logicalKey);
  }

  static empty(): VernanAnimCueSheet {
    return new VernanAnimCueSheet(VernanAnimCueSheet.CURRENT_VERSION, new Map());
  }

  static fromJson(root: unknown): VernanAnimCueSheet {
    if (!root || typeof root !== "object" || Array.isArray(root)) {
      return VernanAnimCueSheet.empty();
    }
    const map = root as Record<string, unknown>;
    const version =
      typeof map.version === "number" && Number.isFinite(map.version)
        ? Math.trunc(map.version)
        : VernanAnimCueSheet.CURRENT_VERSION;
    const entries = new Map<string, VernanAnimEntry>();
    const rawEntries = map.entries;
    if (rawEntries && typeof rawEntries === "object" && !Array.isArray(rawEntries)) {
      for (const [key, value] of Object.entries(rawEntries as Record<string, unknown>)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        entries.set(key, vernanAnimEntryFromMap(key, value as Record<string, unknown>));
      }
    }
    return new VernanAnimCueSheet(version, entries);
  }
}
