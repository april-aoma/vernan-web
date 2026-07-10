/** Thin helpers for preset JSON maps — mirrors Java `game.tileset.v3.JsonMaps`. */

export type JsonMap = Record<string, unknown>;

export function asList(o: unknown): unknown[] | null {
  return Array.isArray(o) ? o : null;
}

export function str(m: JsonMap | null | undefined, k: string, def: string): string {
  if (!m) return def;
  const v = m[k];
  return typeof v === "string" ? v : def;
}

export function num(m: JsonMap | null | undefined, k: string, def: number): number {
  if (!m) return def;
  const v = m[k];
  return typeof v === "number" && Number.isFinite(v) ? (v | 0) : def;
}

export function numDouble(m: JsonMap | null | undefined, k: string, def: number): number {
  if (!m) return def;
  const v = m[k];
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

export function bool(m: JsonMap | null | undefined, k: string, def: boolean): boolean {
  if (!m) return def;
  const v = m[k];
  return typeof v === "boolean" ? v : def;
}

export function mapList(parent: JsonMap | null | undefined, key: string): JsonMap[] {
  const raw = asList(parent?.[key]);
  const out: JsonMap[] = [];
  if (!raw) return out;
  for (const o of raw) {
    if (o && typeof o === "object" && !Array.isArray(o)) {
      out.push(o as JsonMap);
    }
  }
  return out;
}

export function ensureList(parent: JsonMap, key: string): unknown[] {
  const v = parent[key];
  if (Array.isArray(v)) return v;
  const neu: unknown[] = [];
  parent[key] = neu;
  return neu;
}
