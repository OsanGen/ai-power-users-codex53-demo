Original prompt: I want the code way better—fewer errors, higher performance, and absolutely every single bug fixed. That means you need to review every single line of code in every single file and find everything that isn’t working. Do not miss a single thing.

## Progress log
- Added QA/automation hooks:
  - `AIPU.qa` in `/Users/abelsanchez/CODEX/WONDERLAND/src/core.js`
  - `AIPU.render.renderGameToText()` in `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`
  - `window.advanceTime(ms)` and `window.render_game_to_text()` in `/Users/abelsanchez/CODEX/WONDERLAND/src/main.js`
- Updated living spec docs under `/Users/abelsanchez/CODEX/WONDERLAND/final_build/` for Core, Render, Main, Build map, and gaps.
- Baseline verification complete:
  - `node --check /Users/abelsanchez/CODEX/WONDERLAND/src/*.js /Users/abelsanchez/CODEX/WONDERLAND/narrative.js` (pass)
- Automated browser verification complete via `develop-web-game` harness:
  - Scenario set 1: bomb briefing + lesson transitions
  - Scenario set 2: PLAYING state reached; player/enemy/pickup snapshots emitted via `render_game_to_text`
  - Artifacts captured in:
    - `/Users/abelsanchez/CODEX/WONDERLAND/output/web-game-phase0`
    - `/Users/abelsanchez/CODEX/WONDERLAND/output/web-game-play`
- Dependency parity audit complete:
  - Floors and teach cards aligned (`1..15`, no missing IDs)
  - Wave enemy references aligned with `ENEMY_DEFS` (17/17, no missing/unused)
- Known runtime signal from automation:
  - Expected 404 console errors for missing enemy sprite bucket PNGs (fallback remains functional).

## TODO (next agent)
- Continue Phase 1+ contract audit and cleanup in `/Users/abelsanchez/CODEX/WONDERLAND/src/systems.js` and `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js` with behavior lock.
- Add deterministic transition assertions using the new hooks for TITLE -> UPGRADE_SELECT -> LESSON_SLIDE -> FLOOR_INTRO -> PLAYING and death/game-over paths.
- Resolve enemy art 404 noise by adding placeholder PNGs or shipping real enemy bucket art.

## 2026-02-20 patch log (music + spacebar + sprite stability)
- Root-cause fixed for bomb lockout bug:
  - In `/Users/abelsanchez/CODEX/WONDERLAND/src/systems.js`, `resolveFloorIdForBombGate(null)` previously coerced `null` -> `0`, making floor checks fail and zeroing bomb counters even on floor 2+.
  - Updated condition to require non-null override before numeric parsing.
- Bomb briefing alignment fixed:
  - `shouldOpenBombBriefing()` now keys intro briefing to `BOMB_UNLOCK_FLOOR` (floor 2), not hardcoded floor 1.
- Music reliability hardening:
  - `/Users/abelsanchez/CODEX/WONDERLAND/src/audio.js`: removed stale same-track in-flight early return, mounted hidden audio element in DOM, enabled `playsinline`, and exposed candidate diagnostics in `getState()`.
  - `/Users/abelsanchez/CODEX/WONDERLAND/src/systems.js`: reissues `playFloorMusicForFloor(currentFloor())` on FLOOR_INTRO -> PLAYING transition.
- Main-character sprite stability hardening:
  - `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`: added one-time sprite cache priming for move/shoot/dual across all directions.
  - Added `debug.audio` into `render_game_to_text` snapshot payload for deterministic runtime verification.
- Cache token refresh:
  - Updated script and asset cache busts to `v=20260221-20` in `/Users/abelsanchez/CODEX/WONDERLAND/index.html`, `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`, and `/Users/abelsanchez/CODEX/WONDERLAND/src/audio.js`.

## Verification commands run
- `node --check src/*.js narrative.js` (pass)
- Playwright harness runs (pass):
  - `node $HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://localhost:49173 --actions-file /tmp/wonderland-actions-playing.json --iterations 1 --pause-ms 250 --screenshot-dir output/web-game-debug-playing`
  - `node $HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://localhost:49173 --actions-file /tmp/wonderland-actions-briefing-check.json --iterations 1 --pause-ms 200 --screenshot-dir output/web-game-briefing-check`
  - `node $HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://localhost:49173 --actions-file /tmp/wonderland-actions-bomb-floor1.json --iterations 1 --pause-ms 200 --screenshot-dir output/web-game-bomb-floor1`
- Targeted floor-2 bomb probe (custom Playwright script) confirmed:
  - before SPACE on floor 2: charges `1`, enemies `1`
  - after SPACE on floor 2: charges `0`, enemies `0`
  - floor 1 remains `0/0` and does not clear enemies with SPACE.
- Runtime snapshot confirms audio active:
  - `debug.audio.isPlaying: true`
  - `debug.audio.activeSrc: ./SONGS/LEVEL_ 1_15.wav` and floor 2 probe shows `./SONGS/LEVEL_ 2_15.wav`.

## 2026-02-20 patch log (sprite fallback sizing hardening)
- `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`
  - Fixed fallback frame stance sizing: fallback draws now use the fallback frame direction stance scale, not the originally requested direction’s scale.
  - Added `debug.playerSprite` in `render_game_to_text` with:
    - `facingDirection`
    - `requestedMode` / `requestedDirection`
    - `activeMode` / `activeDirection`
    - `holdFrames`
- Cache-bust updated to `v=20260221-21` in:
  - `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`
  - `/Users/abelsanchez/CODEX/WONDERLAND/index.html`

## Verification commands run (latest)
- `node --check src/*.js narrative.js` (pass)
- `node $HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://localhost:49173 --actions-file /tmp/wonderland-actions-playing.json --iterations 1 --pause-ms 250 --screenshot-dir output/web-game-debug-playing` (pass)
- `output/web-game-debug-playing/state-0.json` now includes `debug.playerSprite` and `sprites.cacheBust: v=20260221-21`.

## 2026-02-20 patch log (dual-mode transition responsiveness)
- `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`
  - Added `hasRenderablePlayerSpriteForMode(...)` and mode fallback helper to evaluate target renderability before mode-switch hold.
  - `resolvePlayerSpriteFrameState()` now switches immediately when target mode/direction is drawable, retaining hold-delay only for unresolved assets.
  - Keeps anti-flicker behavior for missing assets while removing avoidable shoot/dual visual lag.
- Cache-bust updated to `v=20260221-22` in:
  - `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`
  - `/Users/abelsanchez/CODEX/WONDERLAND/index.html`

## Verification commands run (dual-mode probe)
- `node --check src/*.js narrative.js` (pass)
- Custom Playwright probe (floor 2, hold ArrowRight through dual threshold):
  - `hold-1.2s`: `requestedMode=shoot`, `activeMode=shoot`, `holdFrames=0`
  - `hold-2.1s`: `burstMode=dual`, `requestedMode=dual`, `activeMode=dual`, `holdFrames=0`
  - `released`: immediate return to `activeMode=move`, `holdFrames=0`

## 2026-02-20 patch log (continuous-shoot dual tracking fix)
- `/Users/abelsanchez/CODEX/WONDERLAND/src/systems.js`
  - Updated `updateRearShotTracking(...)` so hold time accumulates across shoot-direction changes while an Arrow key remains continuously active.
  - This matches the intended rule: dual mode is based on continuous shooting time, not same-direction-only hold.
- `/Users/abelsanchez/CODEX/WONDERLAND/index.html`
  - Bumped only `systems.js` token to `v=20260221-23` for immediate cache refresh of this logic.

## Verification commands run (continuous direction-flip probe)
- `node --check src/*.js narrative.js` (pass)
- Custom Playwright direction-flip probe (floor 2):
  - Before fix, switching `ArrowRight` <-> `ArrowUp` reset hold and blocked dual activation.
  - After fix, hold remained monotonic across direction changes:
    - `phase-4-right-repress`: hold `1.88s`, burst `normal`
    - `phase-5-right-only`: hold `2.10s`, burst `dual`
    - `phase-6-long-both`: hold `3.30s`, burst `dual`

## 2026-02-20 patch log (omni probe + blink-state sprite update)
- Floor-10 omni stress probe completed with direction flips under continuous shooting:
  - Dual active around 2s.
  - Omni active after ~10s continuous hold.
  - Direction flips (`ArrowRight`/`ArrowUp`) do not break accumulation.
- `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`
  - `drawPlayer()` now updates sprite mode state before invulnerability blink culling.
  - Fixes stale `requestedMode/activeMode` carryover (e.g., stuck `omni`) after arrow release when blink frames suppress draw.
- Cache-bust updated to `v=20260221-23` in:
  - `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`
  - `/Users/abelsanchez/CODEX/WONDERLAND/index.html` (`render.js` token)

## Verification commands run (omni + blink-state)
- `node --check src/*.js narrative.js` (pass)
- Custom Playwright floor-10 probe (with forced invuln for survivability):
  - held: `burstMode=omni`, `hold=10.41s`, `activeMode=omni`
  - released: `burstMode=normal`, `hold=0`, `activeMode=move` (no stale omni state)

## 2026-02-20 patch log (non-playing burst reset hardening)
- `/Users/abelsanchez/CODEX/WONDERLAND/src/systems.js`
  - Added `clearDirectionalBurstTracking()` helper.
  - Applied reset in:
    - `stepSimulation()` whenever `game.state !== PLAYING`
    - `enterGameOver()`
    - `enterDeathLesson()`
  - Prevents stale dual/omni hold (`rearShotHoldTime`) and direction key from leaking into non-playing states.
- `/Users/abelsanchez/CODEX/WONDERLAND/index.html`
  - Bumped `systems.js` script token to `v=20260221-24`.

## Verification commands run (non-playing reset)
- `node --check src/*.js narrative.js` (pass)
- Custom Playwright probe confirmed:
  - before terminal: `PLAYING`, `hold=3.2`, `burst=dual`
  - after `enterGameOver()`: `hold=0`, `burst=normal`
  - forced `DEATH_LESSON` step with injected stale hold/key: post-step `hold=0`, `key=\"\"`, `burst=normal`

## 2026-02-20 verification log (full cross-state chain)
- Ran a single deterministic chain probe on floor 10:
  - PLAYING start
  - continuous shoot -> dual -> omni
  - SPACE bomb charge decrement
  - GAME_OVER transition
  - requestRestart -> TITLE
  - relaunch to PLAYING
- Verified invariants in one run:
  - burst hold and direction key reset outside PLAYING
  - bomb charges decrement only when triggered in PLAYING and reset correctly on restart
  - audio stops on GAME_OVER/TITLE and restarts on floor re-entry with correct floor track (`LEVEL_ 10_15.wav`)
  - player sprite mode aligns with burst state (`move` <-> `dual` <-> `omni`) and returns to `move` after release/restart.
