/** When an item is owned, remap exact Vernan sprite colors (Java ItemPaletteOverride). */
export type ItemPaletteOverride = {
  fromArgb: number;
  toArgb: number;
};

export function parseHexColor(raw: string): number {
  let s = raw.trim();
  if (s.startsWith("#")) s = s.slice(1);
  if (!/^[0-9A-Fa-f]{6}$/.test(s)) {
    throw new Error(`Palette color must be 6 hex digits: ${raw}`);
  }
  return 0xff000000 | parseInt(s, 16);
}

export function parseOwnedPaletteOverrides(
  raw: unknown,
  itemId: string,
): ItemPaletteOverride[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`ownedPaletteOverrides on ${itemId} must be an array`);
  }
  const out: ItemPaletteOverride[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each ownedPaletteOverrides entry must be an object");
    }
    const row = entry as Record<string, unknown>;
    const from = parseHexColor(String(row.from ?? ""));
    const to = parseHexColor(String(row.to ?? ""));
    out.push({ fromArgb: from, toArgb: to });
  }
  return out;
}
