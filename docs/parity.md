# Parity contract — Vernan web vs desktop Java

The desktop client (`./run.sh` in the Java repo) is the **source of truth**.
This TypeScript port tracks it; when behavior disagrees, Java wins unless we
explicitly document a web-only exception here.

## Must match

| Concern | Spec / source |
|---------|----------------|
| Tile size | 16×16 (`TileMap.TILE_SIZE`) |
| Framebuffer | 512×320 internal, CSS 1024×640 (`WINDOW_SCALE` 2) |
| Camera zoom | 2× world → framebuffer |
| World viewport | 256×256 above 64 px HUD |
| Timestep | Fixed 60 Hz |
| Y axis | Down is positive |
| Player stand hitbox / spawn | 10×18; spawn Y = `groundTop − 18` |
| Door / level-entry spawn | Door frame: X = door column, Y = `(doorTop+2)×16 − 18`; next floor: center column (`levelEntrySpawnPx`) + `finalizeLevelEntrySpawn` |
| Doors | 2 tiles tall at `x=1` / `x=w−2`, top = `groundY − 2` |
| Seeded dungeon | Same seed ⇒ same layout when using `JavaRandom` (OpenJDK `java.util.Random` LCG) |
| Seed URL | `?seed=` for friend testing |

Authoritative numbers: Java repo `docs/game-specs.md`. Constants mirrored in
[`src/specs.ts`](../src/specs.ts).

## Out of scope (v1 web)

- Desktop editors (hitbox, costume, tile, enemy, …)
- Sandbox disk save / load
- Hot-reload from filesystem mtimes
- Shipping `.aseprite`, PSDs, tools, or Java sources in the player pack
- Audio (`sounds/` is unused by `./run.sh` today)

## Module port order

Do **not** start by translating `GamePanel` wholesale. Port in this order:

1. Loop + input + framebuffer blit *(Phase 0 — done)*
2. `TileMap` / collision / camera *(Phase 1 — done)*
3. Minimal player move / jump / climb *(Phase 1 — done)*
4. Dungeon layout + room gen (RNG parity) *(Phase 2 — done)*
5. Combat + enemies *(Phase 3 — done: sword + crawlers)*
6. Items / costumes / layered body *(Phase 4a — items + pedestals; costumes stubbed)*
7. Bosses + FX *(Phase 5a — Possessed shell + kill FX + BOSS_CLEAR; full bosses stubbed)*
8. Art + input feel *(Phase 6a — Vernan/enemy sprites + attack buffer)*
9. Boss exit loop *(Phase 5b-thin — door seal + ascend → next floor)*
10. Movement parity *(Phase 1b — done: crouch jump, air mom, walk-off, climb, turn, attack locks, landing, hurt/DI/jump hull)*
11. **Room art shells** *(Phase C — thin)* — forest/underground/la sheet blit for SOLID/PLATFORM/LADDER/DOOR
12. **Full tileset draw** *(Phase C+ / C++)* — object-based bridge + MemberGraph + deco + breakables
13. **Combat juice** *(thin)* — squash/stretch, hitstun shake+red, feet explosions
14. **Room transitions** *(thin)* — door fade+poses + N/S ladder room changes
15. **Next (pick one)** — see “Suggested next” below

### Suggested next

Roadmap items still open (pick before implementing):

| Option | Scope | Why |
|--------|--------|-----|
| **A. Mouse** | NORMAL-room second enemy | Fills Phase 3 stub; combat variety on floors |
| **B. Shop buy** | ~~SHOP room + spend currency~~ **done (Shop A)** | Completes Phase 4a run economy loop |
| **D. Possessed rig** | Multi-part body + remaining attacks | Deepens boss you already fight |
| **E. Ladder getup** | ~~Mouth double-tap + getup pose~~ **done (Track A)** | — |
| **F. Costumes / layered body** | Idle/walk/jump composites + item overlays | Phase 4a/6a art system |

Default recommendation if you don’t have a preference: **A (Mouse)** or **B (shop)**.

### Phase room-transition notes

- Shared fade machine: **20f out → swap → 20f in** @ 60Hz; black overlay α ≤ **220**; freezes player/enemies
- **Horizontal doors**: Up/W edge; Vernan `doorenter`/`doorexit` poses (1f composites); **3f** exit hold after fade-in; camera snap on swap; spawn via `horizontalDoorSpawnPx` / `doorFrameSpawnPx` (door column X, stand-H Y — not the legacy −32 pad)
- **Vertical ladders**: hold Up/Down at shaft edges; same fade (no door poses); `FROM_ABOVE`/`FROM_BELOW` spawns; shaft opens through N/S map borders when linked
- **Hold through fade**: `clearHardwareStateForRoomTransition` flushes press edges only (held keys survive) — Java parity
- **Ladder mouth getup**: double-tap Down (18f window) → 10f mount pose → climb; Up at shaft top → 10f dismount pose; single Down on mouth crouches (no drop-through)
- **Boss floor ascend**: fade out → `LEVEL_LOAD_BLACK` (~5s) with climb-in-place then `leveltransition` strip → apply next floor mid-blackout → fade in (Java `startNextLevelAscend`); landing uses `levelEntrySpawnPx` (room center) + `finalizeLevelEntrySpawn`
- Stubbed: keyblock sprite strips (logic live — see gen-correctness)
- Parallel tracks: see [`docs/handoffs/`](./handoffs/README.md)

### Phase breakables/seams notes

- **Sword clears `TILE_BREAKABLE`**: `applySwordBreakables` in mount after `applyAttackHits` (AABB scan → empty; shell seams restore via `SecretSeam.onTileOpened`)
- **ASCII gen order** (Java `buildDungeonContent`): planned W/H (`SecretRoomLayoutPlanner`) → Pass A non-secret + `neighborFaces` → Pass B secret/super + `secretRoomSeams` → `placeSecretEntrances` → enemies last
- **Shells / second wall**: outer frame `x=0`/`w-1`; SECRET dead-end padding `x=1`/`w-2`; SEC-SHELL-COL-1 on door column; buffer at `doorX±1` is the frame (registered at place)
- **Shop / SUPER flat**: flatten `groundY` after entry pad (ITEM/BOSS keep noise); SUPER unify after seam carve
- **Secret entrance placer**: stamps H/V breakable shells; stored on `BuiltDungeon.secretSeams`
- **Door/shell geometry**: full `carveHorizontalFace` (8-tile runway, play floor `doorTop+2`); flank-based vertical mouth/reseat
- **Open-on-enter**: exported `onRoomEntered` — mount calls from fade `onRoomSwapped`
- **SEAM-ANIM**: stagger + **15-step** H camera pan; brick chunks on break
- **Camera (secret seams)**: playable-scroll X (sealed buffers off-camera; half-tile when opened); soft dead-zone chase (`WorldCamera` / Java `SideScrollCamera`); H SEAM-ANIM uses opened-face playable override + pan to tuck anchors; **tier-1** fixed framing (CAM-W16 / CAM-XOR-1) while H seams sealed; ladder shaft lookahead + enemy-below nudge; enemy-focus horizontal clamp
- **Breakable loot**: `BreakableLootRoll` + thin `WorldPickup` (heart/key/coins); shell seams skip loot
- **Sprite chunks**: 8×8 subimages from tileset snapshot when atlas available
- **Step faces**: cliff-mesa placement (NORMAL/BOSS, max 6) with reachability after break
- **Pillar/step caps**: `capInteriorSolidPillarsOnMap` + `enforceInteriorPlayFloorSteps` in `finishSecretRoomMap`
- Stubbed: softlock nav audit (`ProceduralBreakableNav`), dual-seam height bridge, room-persisted chunks
- **Breakable deco**: `canBreakAsDeco` / chance roll at gen; sword clears overlays + `decoLootKind` / brick VFX (persists on room art)

### Phase C++ notes (object-based terrain + deco)

- **Rebuild bridge from objects** at load (Java `TerrainBridgeFromObjects`): autotile → **anchor only** in pools; no raw sheet-member soup
- **Floor filter** on bridge picks (`tileAllowedOnFloor`) so floors 1–2 don’t draw sheet_2/sheet_3 tiles
- SOLID/BREAKABLE: pick is package tag → `connectAs` MemberGraph remaps draw (contiguous block/cave/flesh)
- **DOOR**: full-object top/bottom pairs in layout order; `displayTileIdForDoorIfPaired` (not a single weighted pick)
- Ambient deco: ellipse clusters with **red/blue channel pools** (`decoBlobClusterChannel`); exclude background-scene + ground-scatter tiles; **full-object** footprints; tile+variations expand; **scatterOnEligibleGround** post-pass (grass etc.); drawn at **full opacity**
- **Palette clamp**: `GameColorPalette` snaps full backbuffer to `game-palette.png` (nearest chromatic swatch + black/white clamps); preserves exact in-game sprite colors via `data/palette-exact-source-keys.json` (Java `rebuildExactSourceColors`)
- Room void is **black**; BOSS / SECRET / SUPER_SECRET use Earthbound-style **math backgrounds** (`sprites/background/*.preset.json`, seeded pick)
- Step-face **breakables** (up to 6) in NORMAL/BOSS via cliff-mesa faces + reachability
- Stubbed: placed props, variation profiles; door destination / context themes / quadrants — see Phase art-parity

### Phase C+ notes (full tileset — thin-real)

- Loads full `tileset.json`: objects + `memberGraphLayout`, `terrainBridge`, `proceduralRoomGen` biomes
- Per-room biome roll (`contentSeed ^ 0xB10EB10E`) with terrain-bridge pool overlay
- Superseded terrain pick path by C++ object rebuild + floor filter

### Phase C notes (room art shells)

- Loads `tileset/tileset.json` + floor sheets (`main` / `sheet_2` / `sheet_3` by floor ordinal)
- Shell blit: SOLID 4-neighbor nine-slice; fixed ladder `main_5_2`, platform mid/end, door top/bottom
- Color fill remains as fallback; sealed boss doors stay purple placeholder
- Superseded for terrain by Phase C+ when tileset loads; thin resolve kept as fallback

### Phase 1 notes

- Camera soft-follows anchors (`SideScrollCamera` dead-zone + face bias + ideal smooth τ + ladder shaft + enemy focus); playable-scroll clamps secret buffers off-screen; tier-1 fixed X for sealed one-screen xor rooms
- Stand AABB collision + **jump hull polygon** (`PLAYER_JUMP`) via SAT ∩ tiles during normal jump arc; crouch-jump / walk-off / hurt keep stand/crouch
- Jumpsquat (5 frames), coyote, jump buffer, variable jump release, one-way platforms, ladders
- **Hurt**: defensive hitstun (`freezeFrames`) → knockback with solid clip + one-shot DI (10% mag) → `hurtLocked` until land; per-tick `nudgeCollisionPoseOutOfSolids` while embedded; hurt-air 6 @ 12 FPS
- **Land from jump hull**: stand-feet align + stand-hull crouch prefer / `pushStandHullOutOfSolids` (not jump-pose overlap)

### Phase 2 notes

- Seeded `DungeonLayout` + `SecretRoomGraphPlacer` + slim `RoomGenerator` shells
- Door travel: Up/W while grounded on `D` tiles
- Room tiles are **shells** (frame/ground/doors/ladder column) — no biomes, deco, breakables
- Secret candidate enumeration sorts keys before expand (stabilizes vs Java `HashSet` order)

### Phase 3 notes

- Sword windup/active/recover **10 / 4 / 20** frames; AABB from `SWORD_ATTACK_ACTIVE` polygon
- **Crouch attack** (latched at begin): ground crouch or air-Down (not crouch-jump); windup **−2**, recover early **−4** / late **−2**; damage **×0.8**; `SWORD_CROUCH_ATTACK_ACTIVE` hitbox; knock at 80° ×0.85 mag; art `vernan/sword crouch attack.png`
- Contact damage **1**, i-frames **1.125 s**, knock `±74 / -98`, HP **6**
- Crawler-only spawns in NORMAL (budget from `contentSeed ^ 0x5DEECE66D`)
- Stubbed: Mouse, bosses, subweapons, heavy attacks, sprite art

### Phase 4a notes

- `ItemCatalog` loads `data/items.json`; ITEM rooms get a pedestal; **touch** to collect
- Seeded `PedestalItemDecks` (ITEM_ROOM / BOSS_CLEAR / SHOP); inventory stacks; `PlayerStats.applyItemPassives`
- **Bottom HUD** (Java `BottomHudLayout` / `drawBottomHud`): black 64px band; hearts 16px + half frames; coin/key + `formatMoneyHud`; combat stats (dmg×2 / squat / windup); passive strip newest-first; weapon+sub frames; minimap; money/key drain/gain anim
- **Minimap reveal items**: MAP → unvisited ITEM/SHOP/BOSS in color; COMPASS → dark non-secret silhouette; EYE_OF_HORUS → secret/super-secret cells
- Item sheets: left **16×16** on pedestals / pickup card; right **16×16** in HUD (`ItemSpriteArt`)
- **Item pickup overlay**: full-frame dim + pickup art + name/flavor/effect; Vernan **item pose** (`vernan item.png`) with held item above head; auto-dismiss **2.75s**; freezes sim while active
- **Soul / black hearts**: container `Health` (RED/SOUL/BLACK); grants from `soulHeartsOnPickup` / `blackHeartsOnPickup`; HUD uses `soul heart.png` / `black heart.png` (2 frames)
- **Subweapon HUD**: equip on pickup (`PlayerItemInventory.equippedSubweapon`); pickup icon in sub slot; cooldown tint/band via `SubweaponCooldowns` (tick ready; fire stubbed)
- **Pause**: Enter/Esc or HUD left-shoulder **II** toggles `paused`; freezes sim; dim overlay + “PAUSE” + item grid menu (`PauseOverlay`); button highlights while paused
- Stubbed: costumes/layered body, secret pedestals, full `ItemEffects`, subweapon *gameplay*, full touch-control chrome, K_CANDY uses badge

### Phase shop notes (Shop A)

- SHOP rooms: lazy 1–2 priced pedestals (`$15`, `PedestalItemDecks.drawShop`); **Up/W** while overlapping to buy (gates on `PlayerStats.money`)
- Cat shopkeep (`cat shopkeep sheet.png`): placed left of wares; head bob + tail warp + pupils track Vernan; drawn before player
- Price labels in device space; free ITEM/boss pedestals unchanged
- Run starts with **30** coins (stub until combat coin drops)
- Stubbed: mini-buy lift overlay, heart/key world pickups priced in shop, subweapon shop swap
- **Math backgrounds**: boss/secret presets via `BackgroundPresetRegistry` + `BackgroundRendererV3` (scroll/parallax/distortions/blends); occlusion skips solid tiles + deco cells

### Phase 5a notes

- BOSS rooms spawn **Possessed** (32 HP) at mid-room ~40% height; float A→C→B phases; AABB combat
- `roomCombatCleared` prevents respawn; death waits **4 s** (`DEATH_REWARD_DELAY_SEC`) before clear
- On clear: kill explosion + **BOSS_CLEAR** pedestal (`PedestalItemDecks.drawBossClear`)
- HUD: boss HP bar; hit flash on Possessed
- Stubbed (5b): Nephilim, Modern Chicken; Lil familiar

### Phase 6a notes

- Feet-pinned Vernan art: idle / walk / jump / crouch / climb / attack (+ sword overlay) / crouch attack
  - Climb uses layered `sprites/vernan/climb {base,arm,hair}.png` composite (legacy flat strip fallback)
- Crawler strip + Possessed body frame (full rig later)
- **Attack buffer** (~0.14 s): X during recover / landing lock / hitlag chains into next swing
- Jump buffer already existed; presses also latch during hitlag
- **Browser input machine** (Java `Input` parity): press edges survive key-up; lag-stash when sim skips a frame; `primeLagInputBuffers` during timestop; window capture listeners
- Stubbed: layered body/costumes (climb+hurt use base/hair composites), turn/hurt/airdodge full costume routes
  - Room terrain art: Phase C++ (object-based bridge + MemberGraph + full-object deco + step breakables)

### Phase 5b-thin notes

- BOSS enter: staggered door seal (blocks Up/W exit until clear)
- On clear: unseal + BOSS_CLEAR pedestal + full-height **ascend ladder** (opposite pedestal)
- Climb ascend shaft to ceiling → fade → blackout climb/`leveltransition` strip → rebuild dungeon at `floorOrdinal + 1` (same run seed; decks keep acquired)
- HUD shows `floor N`
- Stubbed: seal tile art, Nephilim/Chicken
  - Special Possessed drops (Lil / Head) live — see Phase 5b-possessed
  - (Normal door/ladder room fades are in Phase room-transition)

### Phase 5b-possessed notes

- Possessed clamps to **camera viewport** (28px margin) so it stays on-screen with Vernan
- Vision radius = `min(viewW, viewH)`; Phase B orbit standoff + aggression scaling
- **Live combat (Java parity):** aimed / volley / fan (±45°) / 8-way nova / dash-through; kite at ≤1/3 HP; dodge+counter when threat closing; contact damage only during juke/dash windows
- Pattern unlock at ≤50% HP (`PATTERN_HP_FRAC`); dash chance in mid range at any HP
- Multi-part draw from `possessed.rig.json` (head/body/hands) via `partRenders()` + EarthBound **scanline warp** (`warpPossessedPartFrame`); charge / nova ring telegraphs
- **Boss arena platforms** live in RoomGenerator (`possessedBossArena` floating `-` platforms)
- **Shiny variant** (`EnemyVariantRegistry`): 33% via `contentSeed ^ 0x51E0E5055`, HP 24, shiny strip; AI deltas (×1.2 move, kite ≤50%, dodge+counter from full HP, no dash / range-keyed attacks, upward dodge, down counter aim, start Phase A)
- **Special boss drops** (`possessedBossReward`): Lil / Head until both owned (50/50 seed `^ 0x10557055ED`), else BOSS_CLEAR; `commitAssigned` on place
- **Bullet die FX**: despawn queue + 2-frame die strip draw
- **Full PartSim** (Java parity): world-space springs (`SETTLED_K=220` / `LOOSE_K=40`), knock-loose + `moveLooseWithBounce` (`WALL_REST=0.7` / `FLOOR_REST=0.6`), `ANCHOR_TRAIL_FRAC=1.0`; hurt/collision hulls from rig
- **Possessed Head** melee: horizontal bullet on attackPhase 2 rising edge (`PossessedHead.ts`)
- **Death debris**: BrickChunks from part sim centers on death start (boss `partRenders` empty while dying)
- Stubbed: **LilPossessed familiar** (Head works; familiar deferred — see `LilPossessed.ts`); full pivot-hull death debris (colored BrickChunks stand in)

### Phase 1b notes (movement parity)

- **Air momentum**: weak air steer (`×0.25`); neutral input preserves `vx`; high-speed jump uses peak `|vx|` over jumpsquat
- **Walk-off**: latch on leave-ground without jump; frozen walk frame; air cap `0.2×maxAir`; fall uses `gravityReleaseMult` (2.85×); min 5f landing lock
- **Crouch jump**: Down+jump starts jumpsquat; crouch hull kept airborne until land
- **Climb**: sticky shaft column; latch after collide (Up on rung / falling / mouth-through-continue; Down shaft / mouth); preserve ascent into mouth; thin top step-off (instant land; getup stubbed); anim at 5 FPS; immediate jump-off with side/neutral kick
- **Browser**: gameplay keys always `preventDefault` (incl. repeat); focused canvas locks page scroll / wheel
- **Turn**: `renderFacing` lag (4+4 frames) + `vernan turn.png` / reverse-skid pose
- **Attack commit**: active/recover — grounded hard-brake; **airborne freezes `vx`** (no steer/kill); jump buffer survives sword; facing locked mid-swing
- **X during jumpsquat**: swing starts immediately; squat continues → rising air attack (leave-ground cancel runs before lift-off so ground-started swing isn't wiped)
- **Multi-hit sword**: one active frame hits every overlapping enemy + all breakables in the AABB, then latches (Java `applyAttackHits`)
- **Landing**: extended-fall timer (0.12s after apex) → lock `(extendedFallFrames/5)*2` capped at 20; walk-off floor 5f; air-attack land = 20f; lock ticks only on ground; Down suppressed + crouch queued; **jump cancels landing lock**; jump sheet frame 3 after same delay
- **Landing collision**: jump-hull feet snap → `finishJumpLandingCollision` stand align; landing-lock crouch is **visual only** (stand `h` kept); `resolveVertical` uses Java crossed-from-above / platform slack + polygon∩tile
- **Horizontal deck exemption**: leading-column wall scan; landing/resting decks defer to vertical (no `vx` kill on floor lips); `poseForFeetSupport` for jump-hull thin-deck probes
- **One-ways**: stay solid while crouching; mouth drop-through only via `walkOffLedgeActive` + ladder under tile (or getup mount)
- Stubbed: air dodge / wavedash, walk-off ledge strip asset, landing dust FX, costumes, keyblock shaft *logic* beyond solid tiles

### Phase juice notes (combat feel)

- **Defensive hitstun**: sprite shake (±4 px from amp 8) + solid red SrcAtop; knock starts after freeze
- **Offensive hitlag**: freeze only (no shake/red)
- **Hurt fade tint**: 0.35s red after knock (alpha up to 220)
- **Squash/stretch**: feet-anchored volume-conserving; jump Y 1.2, land X 1.2 (recover = landing lock), crouch enter X 1.1/4f; crawler hop/land too
- **Kill explosions**: feet-centered (top = feetY − dh); crawler waits until death hitstun ends
- **Hit sparks**: sword `HitVfx` slash (2-frame hitlag→fade rotate); pickup collect strips rise + sine wobble
- Stubbed: landing dust, heavy-attack camera shake, black-heart overlay, non-slash HitVfx kinds

### Phase terrain-core notes

- **RoomGenerator** thickened toward Java `generate`: `maxVerticalReachTilesForGridY` (easy 2 / standard 3), `enforceMaxWalkableGroundYStep`, GEN-LADDER-1 random `H`, floating `-` platforms (NORMAL + BOSS), step breakables in generate + softlock strip (`ProceduralBreakableNav`), pillar/play-floor caps with content `pillarThinSeed`
- **Post–Pass B order** (GEN-ORDER-1): secret content → `LadderVerticalSeamAlign.applyAll` → `applyPostDungeonPasses` → `placeSecretEntrances` → `applyFinalShaftPass` → keyblocks → enemies
- **Secret loot**: `applySecretPostGenerationContent` (pedestal / key×3 / heart×3 / coin×10; SUPER cluster); `mountDeferredRoomPickups` thin hook in `mount.ts`
- Still stubbed: placed props, `start.json`, full PendingGroundedDeco deferral inside generate (deco stamps after final terrain via enrich)

### Phase gen-correctness notes

- **Keyblocks**: `KeyblockEntrancePlacer` (floor ≥2 ITEM/SHOP parent seals), strip secrets, seam reconcile; runtime tick/spend/restore + freeze; ladder path gates; `KeyblockBypass` on ITEM/SHOP enter
- **Dual-seam**: `SecretDualSeamNav` + `bridgeDualSeamHeights` in `finishSecretRoomMap` (SEC-DUAL-1)
- **Deco**: enrich stamps once on final terrain; thin `regroundDecoStampsToFinalTerrain` for ground-hugging support loss; idempotent skip re-stamp
- **Safety / connectivity**: `LadderSafetyPlatforms` + `TerrainSolidConnectivity` in generate + `applyPostDungeonPasses` / final shaft `enforceOnMap`
- Still stubbed: keyblock sprite strips, placed props, `start.json`

### Phase art-parity notes

- **Door destination**: `DoorDestinationResolver` — ITEM/SHOP/BOSS door art from neighbor/source kind; wired via `doorDestByCell` in `drawShellTiles` / `resolveDisplayTile`
- **Context themes**: parse `contextThemeRules` (project + biome); flank bake in enrich; draw-time `themedDisplayTileId` swap
- **Quadrant composites**: `QuadrantCompositeAutotile` inner-corner 8×8 overlay after MemberGraph blit
- Still stubbed: placed props, `start.json`, variation profiles

### Phase terrain-bridge-v3 notes

- **Rebuild** matches Java `TerrainBridgeFromObjects`: global tile scan with eligibility / object-scope / non-anchor skips; objects → per-kind; legacy `placedPropsByRoomKind` merge; pool weight apply
- **RoomScope** on tile defs (`allowRoomKinds` / `denyRoomKinds`, `SECRET_ROOM` alias) filters rebuild members and draw picks (`tileAllowed` = floor + room kind)
- Still stubbed: editor write-back / `scrubRootDecoTilePool`; EMPTY terrain bridge entry

### Phase animated-tiles notes

- **Composite path** (`TileRenderResolve` / `TileCompositeRenderer` / `TileWorldRenderer`): `visualClips` (loop/pingpong), `scanlineWarp` (pinned-row sway), `glowPulse`, multi-layer + `add` blend
- Wired through `drawShellTiles` with `simTick = floor(timeSec * 60)`; static tiles still use `SheetAtlas`
- Acceptance: grass tufts sway (position-desynced); flame/candle cycles + halo + warp

### Phase placed-props notes

- **Types**: `PlacedRoomObject` + `RoomArtData.placedRoomObjects`; pool parse widens optional `z` / `solidsOnly`
- **Place**: `placeProceduralPlacedProps` after ambient deco + context flank bake in `enrichRoomArt` (not `buildDungeon`); skip START; weighted slots; ladder±1 / door columns avoided; ground-top + SOLID/PLATFORM stamp; `evictDecoOverlappingPlacedProps`
- **Draw**: expand object refs → members, ground-support filter, zOrder sort; blit after terrain in `drawShellTiles`; deco skip on prop-owned cells
- Shipped `tileset.json` pools are empty — scaffolding ready when pools are filled
- Still stubbed: `start.json` merge, biome-row placedProps merge, HVST strip widening, keyblock sprites

## Adapters

| Java | Web |
|------|-----|
| `user.dir` + `Files` / `ImageIO` | `AssetLoader` (`fetch` + `ImageBitmap`) |
| `java.util.Random` | `JavaRandom` |
| Swing / dual EDT+sim thread | Single `requestAnimationFrame` loop |
| `Graphics2D` / `getRGB` FX | Canvas `ImageData` first; shaders later |
| `HitboxValues.java` | Hand-port or generate; still authored via desktop HitboxEditor |

## PoC note

[page-d](https://henrybasu.github.io/hb_website/page-d.html) is reference only
(display constants, seed URL, Canvas 2D). This repo does **not** continue that
codebase.
