# Agent hand-off: Shops + backgrounds + deco polish

**Repo:** `/Users/aprilaberdeen/Desktop/vernan-web`  
**Java SoT:** `/Users/aprilaberdeen/Desktop/new vernan!`  
**Run:** `cd ~/Desktop/vernan-web && npm run sync-assets && npm run dev`

## Goal

Ship **SHOP buy loop** (spend currency, mini-buy feedback) and/or **room presentation**: fixed backgrounds, boss backgrounds, richer deco — without touching combat movement or breakable/seam logic.

Pick one primary slice first (shop **or** backgrounds); don’t boil the ocean.

## Own these files (preferred)

### Shop

- `src/item/*` — catalog, decks, money/keys if missing
- New: `src/world/Shop*.ts`, HUD money drain helpers
- `data/items.json` only if shop defs need fields (keep schema compatible)
- `docs/parity.md` — Phase shop notes

### Backgrounds / deco

- `src/tileset/*` draw path: `drawShellTiles.ts`, new `drawBackground*.ts`
- Asset load in `mount.ts` **only** for bg bitmaps / draw calls (minimal diff)
- `public/assets/` bg sheets as needed via sync-assets

## Do NOT touch

| File | Owner |
|------|--------|
| `src/entity/Player.ts` | Movement chat |
| `src/input/Input.ts` | Movement chat |
| `src/world/roomTransition.ts` / `roomFade.ts` | Movement chat |
| `src/world/Secret*` / breakable combat | Agent B (breakables+seams) |
| `src/world/RoomGenerator.ts` terrain carve | Prefer Agent B if seams/breakables; you may add shop props only |
| Sword hitboxes / enemy AI | Leave alone |

## Java references

### Shop

- `GamePanel` mini-buy overlay (`MINI_BUY_OVERLAY_FRAMES = 20`, heart/key lift pose)
- HUD money drain (`HUD_MONEY_DRAIN_FRAMES_PER_COIN = 4`)
- Shop room generation / shopkeep entity if present
- `PlayerStats.money` / buy validation

### Backgrounds

- Room background draw in `GamePanel` / tileset v3 runtime
- Boss room backdrop vs NORMAL fixed bg
- Deco already partially ported (C++); extend, don’t replace MemberGraph solids

## Web current state

- ITEM pedestals + touch collect work; **SHOP buy stubbed**
- Terrain art C++; ambient deco thin; **no full fixed/boss backgrounds**
- Door/ladder fades exist — don’t regress them

## Suggested thin cuts

**Shop A:** Show price on SHOP pedestal → spend money on touch → grant item (no shopkeep anim yet)  
**Shop B:** Mini-buy overlay 20f + HUD coin drain  
**BG A:** Parallax or static room bg behind shell tiles (NORMAL)  
**BG B:** Boss-specific backdrop when `RoomKind.BOSS`

## Acceptance

- [x] Shop A + HUD + soul/black + subweapon overlays (prior slices)
- [x] Deco full opacity; black room void; math boss/secret backgrounds
- [x] Pause button (HUD II) + Enter/Esc + pause overlay/menu
- [x] Palette exact-source preserve (Java rebuildExactSourceColors keys)
- [x] Mini-buy overlay / heart-key shop pickups (optional next)
- [x] No edits to climb, door hold, or breakable clear logic
- [x] `npx tsc --noEmit` clean
- [x] `docs/parity.md` note added

## Coordination

- Pedestal collect currently free — shop should **gate** on room kind + cost without breaking ITEM free pedestals
- If shop needs a post-room-enter refresh, export a function; movement chat can call it
