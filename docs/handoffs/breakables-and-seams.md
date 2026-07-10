# Agent hand-off: Breakables + secret seams

**Repo:** `/Users/aprilaberdeen/Desktop/vernan-web`  
**Java SoT:** `/Users/aprilaberdeen/Desktop/new vernan!`  
**Run:** `cd ~/Desktop/vernan-web && npm run sync-assets && npm run dev` (`?seed=` optional)

## Goal

Make **breakable tiles** hittable/destroyable and wire **secret room seams** as breakable barriers that open into secret rooms (Java `SecretEntrancePlacer` / seam open-on-enter + break).

Seams belong here because they are breakable shells, not a separate movement system.

## Own these files (preferred)

- `src/world/TileMap.ts` — breakable collision / clear helpers (extend carefully)
- `src/world/SecretRoomGraphPlacer.ts` — already exists; extend
- New: `src/world/SecretEntrance*.ts`, `src/world/Breakable*.ts` (or similar) as needed
- `src/world/RoomGenerator.ts` / `buildDungeon.ts` — only for placing breakables / seam stamps
- `src/tileset/placeAmbientDeco.ts`, `enrichDungeonArt.ts` — only if breakable art stamps need it
- `src/entity/Crawler.ts` / combat hit apply — only if enemies should also break tiles
- `docs/parity.md` — add a **Phase breakables/seams** note (append; don’t rewrite other phases)

## Do NOT touch (other agents / this chat)

| File | Owner |
|------|--------|
| `src/entity/Player.ts` | Movement chat (hold-through-doors, ladder double-tap/getup) |
| `src/input/Input.ts` | Movement chat |
| `src/world/roomTransition.ts` | Movement chat (except calling a seam-open hook after swap — prefer a callback API you export) |
| `src/world/roomFade.ts` | Movement chat |
| `src/world/BossDoorSealAnim.ts` / `BossAscend.ts` | Leave unless seal cells must interact with breakables |
| `src/mount.ts` | Coordinate: only add thin hooks (e.g. `applySwordBreakables`, draw break FX). Avoid rewrite of update/render loop |
| Shop / money / backgrounds | Agent C |

## Java references (start here)

- `game/world/SecretEntrancePlacer.java` — seam kinds, stamp breakable/door, open on traverse
- `game/world/SecretSeamOpenAnim.java` — open animation / camera pan (`Physics.SEAM_ANIM_CAMERA_PAN_STEPS`)
- `game/world/SecretRoomMapBuild.java` / `OneScreenSecretRoomExpand.java`
- Breakable combat: sword/active hit vs `TILE_BREAKABLE` in `GamePanel` / room clear paths
- Specs: `docs/game-specs.md` (thrown breakable 16×16; door seam camera pan)

## Web current state

- Shell rooms can stamp step-face breakables (C++) but **no hit → clear** gameplay
- Secret graph placer exists; **no seam break / open-on-enter**
- Room transition stub note: “secret seam open-on-enter”

## Suggested thin cut (ship in order)

1. **Sword clears `TILE_BREAKABLE`** under active sword AABB (one cell or flood per Java rules — match Java first)
2. **Secret horizontal/vertical seams** stamped as breakable (or door) between NORMAL↔SECRET
3. **Open on enter** when transitioning across a seam face (hook from room swap — export `onRoomEntered(prev, next, spawnKind)` so movement chat can call it without you editing transition guts)
4. Optional: seam open anim / camera pan (can follow)

## Acceptance

- [x] Hitting a breakable with sword removes it and player can walk through
- [x] At least one secret seam can be broken or opens when entered from the linked room
- [x] No changes to door fade, climb latch, or Input hold behavior
- [x] `npx tsc --noEmit` clean
- [x] `docs/parity.md` updated

## Follow-ups (optional)

- [x] Seam open anim / camera pan (`SecretSeamOpenAnim`, 15-step H pan)
- [x] Thin brick-chunk debris on break + seam steps
- [x] Door/shell re-align with Java (runway + SEC-SHELL-COL-1 + flank mouth/reseat)
- [x] ASCII shells + second wall + shop flat + Java gen order (planner / two-pass / finish)
- [x] Breakable loot rolls / sprite-subimage chunks
- [x] Playable-scroll override during pan; step/pillar caps (thin)
- [x] Softlock nav audit (`ProceduralBreakableNav` thin); dual-seam height bridge still open
- [x] Deco-breakable loot (canBreakAsDeco roll + strike + decoLootKind)
- [x] Terrain-core first cut: RoomGenerator interior + post–Pass B order (ladder align / secret loot); still stubbed keyblocks, deco-in-generate, placed props, start.json

## Coordination

If you need a post-swap hook, add it in **your** module and ask the movement chat to call it from `applyRoomAndSpawn` / `tickSessionRoomTransition` — don’t rewrite those files yourself.
