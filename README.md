# Vernan (web)

Portable TypeScript / Canvas 2D client for Vernan. Embeddable on any static host.
The desktop Java game (`./run.sh`) remains the behavior source of truth.

This repo is **Phase 0 prep**: scaffold, adapters, parity contract, and asset sync.
Gameplay systems are ported next.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL. Click the canvas for keyboard focus. Optional: `?seed=12345`.

### Runtime assets

Assets are **not** committed. Pack them from the Java repo, then sync:

```bash
# In the Java Vernan repo:
./scripts/pack-runtime-assets.sh
# → dist/vernan-runtime-assets.zip + dist/runtime-pack/

# In this repo (sibling path "../new vernan!" is the default):
npm run sync-assets
# or:
npm run sync-assets -- --zip "/path/to/vernan-runtime-assets.zip"
```

The pack is a **filtered** runtime subset (PNGs/JSON/rigs that `./run.sh` loads),
not the full Desktop tree — no `.aseprite`, tools, or `sounds/`.

See [docs/hosting.md](docs/hosting.md) and [docs/parity.md](docs/parity.md).

## Embed on any site

```html
<div id="game" tabindex="0"></div>
<script type="module">
  import { mount } from "./vernan-web.js";
  mount("#game", { assetBase: "/assets/vernan/", seed: 12345 });
</script>
```

`assetBase` must end with `/` and contain the unpacked runtime pack
(`sprites/`, `data/`, `tiles/`, `tileset/`).
