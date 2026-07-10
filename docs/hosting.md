# Hosting & asset smoke test

Vernan web is a static app: build once, drop `dist/` (or Vite `public/assets` +
bundled JS) onto any host (GitHub Pages, Netlify, S3, your own nginx, etc.).

## Asset size

Expect a **filtered** runtime pack (often a few MB to tens of MB), not the full
~123 MB `sprites/` tree. The packer follows `InGameSpritePaths` plus known
JSON/rig/data paths and **excludes** `.aseprite`, tools, and unused `sounds/`.
If you previously mirrored the whole tree (e.g. the page-d PoC), that was larger
than necessary.

## Pack from the Java repo

```bash
cd "/path/to/java/vernan"
./scripts/pack-runtime-assets.sh
# → dist/vernan-runtime-assets.zip
# → dist/runtime-pack/   (unpacked copy)
# → dist/runtime-manifest.json
```

The packer uses `InGameSpritePaths.collect` plus known JSON/rig/data paths so
contents stay aligned with what `./run.sh` loads.

## Sync into this repo

```bash
cd /path/to/vernan-web
npm install

# Preferred when the Java tree is a sibling named "new vernan!":
npm run sync-assets

# Or explicit:
npm run sync-assets -- --java-root "/path/to/java/vernan"
npm run sync-assets -- --zip "/path/to/vernan-runtime-assets.zip"
npm run sync-assets -- --from-dist "/path/to/java/vernan/dist/runtime-pack"
```

This writes into `public/assets/{sprites,data,tiles,tileset,runtime-manifest.json}`.
Those paths are gitignored.

## Local smoke test

```bash
npm run sync-assets
npm run dev
```

1. Open the printed URL (default `http://localhost:5173`).
2. Click the canvas (keyboard focus).
3. Confirm the boot overlay shows `runtime-manifest.json ok` (green).
4. Try `?seed=12345` — seed label should update.
5. F3 toggles the debug line; arrow keys / Z / X should light the input flags.

Until gameplay is ported, you will **not** see a full dungeon — only the Phase 0
scaffold. The smoke test proves pack + mount + loop + input.

## Embed on any site

1. `npm run build` → `dist/`.
2. Copy `dist/` assets and the built JS/CSS, **or** serve `public/assets` at a
   known URL and point `assetBase` there.
3. Mount:

```html
<div id="vernan" tabindex="0"></div>
<script type="module">
  import { mount } from "./assets/index.js"; // path depends on your build
  mount("#vernan", {
    assetBase: "/path/to/vernan-assets/", // must end with /
    seed: 12345, // optional; else ?seed= or random
  });
</script>
```

### Checklist for hosts

- [ ] `assetBase` is reachable (CORS ok if cross-origin)
- [ ] Trailing slash on `assetBase`
- [ ] Long-cache hashed build assets; shorter or hashed names for the pack if you update often
- [ ] Canvas / root is focusable (`tabindex="0"`) so keyboard works
- [ ] Do not ship `.aseprite`, editors, or Java sources in the public pack

## What not to zip for players

- `src/`, `tools/`, `out/`, `build/`, `tmp/`
- `sprites/**/*.aseprite`, PSDs, `images 2017/`
- `sounds/` (unused by desktop runtime today)
- Docs / Cursor plans
