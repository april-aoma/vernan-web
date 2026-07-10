/**
 * Asset loading via fetch + ImageBitmap (replaces cwd Files / ImageIO).
 */
export type AssetLoaderOptions = {
  /** Base URL ending with `/`, e.g. `/assets/` or `https://cdn.example/vernan/`. */
  assetBase: string;
};

function joinBase(base: string, rel: string): string {
  const b = base.endsWith("/") ? base : `${base}/`;
  const r = rel.replace(/^\/+/, "");
  return b + r.split("/").map(encodeURIComponent).join("/");
}

export class AssetLoader {
  readonly assetBase: string;
  private readonly images = new Map<string, ImageBitmap>();
  private readonly texts = new Map<string, string>();

  constructor(opts: AssetLoaderOptions) {
    this.assetBase = opts.assetBase.endsWith("/") ? opts.assetBase : `${opts.assetBase}/`;
  }

  url(relPath: string): string {
    return joinBase(this.assetBase, relPath);
  }

  async loadImage(relPath: string): Promise<ImageBitmap> {
    const cached = this.images.get(relPath);
    if (cached) return cached;
    const res = await fetch(this.url(relPath));
    if (!res.ok) {
      throw new Error(`Failed to load image ${relPath}: ${res.status} ${res.statusText}`);
    }
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    this.images.set(relPath, bmp);
    return bmp;
  }

  async loadText(relPath: string): Promise<string> {
    const cached = this.texts.get(relPath);
    if (cached) return cached;
    const res = await fetch(this.url(relPath));
    if (!res.ok) {
      throw new Error(`Failed to load text ${relPath}: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    this.texts.set(relPath, text);
    return text;
  }

  async loadJson<T = unknown>(relPath: string): Promise<T> {
    return JSON.parse(await this.loadText(relPath)) as T;
  }

  getImage(relPath: string): ImageBitmap | undefined {
    return this.images.get(relPath);
  }

  /** Best-effort probe: returns false if the pack is missing (dev without sync). */
  async hasManifest(): Promise<boolean> {
    try {
      const res = await fetch(this.url("runtime-manifest.json"), { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }
}
