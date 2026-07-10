# Parallel agent ownership

| Track | Chat / agent | Hand-off doc | Owns | Must not touch |
|-------|--------------|--------------|------|----------------|
| **A. Movement / transitions** | This chat (you + Auto) | _(inline)_ | `Player.ts`, `Input.ts`, `roomTransition.ts`, `roomFade.ts`, climb/getup, door hold | Breakable clear, secret seam stamps, shop economy, bg art systems |
| **B. Breakables + seams** | Separate agent | [breakables-and-seams.md](./breakables-and-seams.md) | Breakable hit/clear, secret seams, related room stamps | `Player.ts`, `Input.ts`, fade machine guts |
| **C. Shops + backgrounds** | Separate agent | [shops-and-backgrounds.md](./shops-and-backgrounds.md) | Shop buy, money HUD, fixed/boss bgs, deco polish | Movement, seams/breakable combat |

## Shared rules

1. **One owner per hot file.** If you need a hook in someone else’s file, export an API and ask that owner to call it.
2. Append to `docs/parity.md`; don’t rewrite other phases’ notes.
3. Prefer new modules over stuffing `mount.ts`.
4. `npx tsc --noEmit` before hand-back.

## This chat’s current queue (Track A)

1. ~~Hold buttons through doors~~ — `clearHardwareStateForRoomTransition` (keep `keysDown`, flush edges)
2. ~~Double-tap Down on ladder mouths → getup / drop-through~~ — `LADDER_MOUTH_DOUBLE_TAP_FRAMES = 18`, `GETUP_LOCK_FRAMES = 10`; top step-off getup too
3. ~~Boss floor-ascend cinematic~~ — fade → `LEVEL_LOAD_BLACK` climb + `leveltransition` strip → next floor mid-blackout → fade in
4. ~~Collision polish~~ — horizontal deck exemption + mouth-only drop-through + `poseForFeetSupport`
5. ~~Possessed full combat + follow-up~~ — attacks/rig; shiny; Lil/Head drops; Head melee; knock-loose; bullet die; death debris (Lil familiar still stubbed)
6. **Next:** (open — Lil familiar, Mouse enemy, air dodge, or costumes)
