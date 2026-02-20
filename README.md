# AI Power Users - Codex 5.3 Tech Demo

Canvas-based 2D top-down survival shooter (vanilla HTML/CSS/JS) with floor progression, stackable upgrades, bomb progression, run summary/share flow, and neural-net teaching copy.

This README documents current behavior from code in:
- `/Users/abelsanchez/CODEX/WONDERLAND/index.html`
- `/Users/abelsanchez/CODEX/WONDERLAND/narrative.js`
- `/Users/abelsanchez/CODEX/WONDERLAND/src/core.js`
- `/Users/abelsanchez/CODEX/WONDERLAND/src/content.js`
- `/Users/abelsanchez/CODEX/WONDERLAND/src/upgrades.js`
- `/Users/abelsanchez/CODEX/WONDERLAND/src/share.js`
- `/Users/abelsanchez/CODEX/WONDERLAND/src/systems.js`
- `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`
- `/Users/abelsanchez/CODEX/WONDERLAND/src/main.js`

## Tech stack

- Runtime: browser JavaScript (no build tools, no framework)
- Rendering: `<canvas>` 2D context
- UI overlays: canvas + two DOM modals (`Source text`, `Share your run`)
- Fonts: Sora + Inter (Google Fonts)
- Module pattern: plain scripts attached to `window.AIPU`

## Run locally

Option 1:
- Open `/Users/abelsanchez/CODEX/WONDERLAND/index.html` directly in a browser.

Option 2 (recommended):
1. In `/Users/abelsanchez/CODEX/WONDERLAND`, run:
```bash
python3 -m http.server 4173
```
2. Open [http://127.0.0.1:4173/index.html](http://127.0.0.1:4173/index.html)

## QA checks

- Run a one-shot UI bootstrap smoke check against local staging:
```bash
./scripts/check-ui-bootstrap.sh staged
# or override staging target:
QA_TARGET_URL=http://127.0.0.1:4173 ./scripts/check-ui-bootstrap.sh
```
- NPM wrapper:
```bash
npm run qa:bootstrap
```

- Run the same check against the deployed page:
```bash
./scripts/check-ui-bootstrap.sh deployed
# or override deployed target:
QA_DEPLOYED_URL=https://osangen.github.io/ai-power-users-codex53-demo ./scripts/check-ui-bootstrap.sh deployed
```
- NPM wrapper:
```bash
npm run qa:bootstrap:deployed
```

- Run both staged and deployed checks in one pass:
```bash
./scripts/check-ui-bootstrap.sh both
```
- NPM wrapper:
```bash
npm run qa:bootstrap:both
```
- Run one-shot staged+deployed assertion in a single node automation step:
```bash
npm run qa:bootstrap:oneshot
```
```bash
QA_TARGET_URL=http://localhost:4173 QA_DEPLOYED_URL=https://osangen.github.io/ai-power-users-codex53-demo npm run qa:bootstrap:oneshot
```
- CI usage:
- GitHub Actions: `.github/workflows/qa-ui-bootstrap.yml`
- Trigger paths: `workflow_dispatch`, `push` on `main`, or `pull_request`.

- Direct Playwright command:
```bash
QA_TARGET_URL=https://osangen.github.io/ai-power-users-codex53-demo npx playwright test wonderland-qa.spec.js --grep "AIPU UI bootstrap smoke check"
```

## Project layout

- `/Users/abelsanchez/CODEX/WONDERLAND/index.html`: app shell, canvas, modals, script loading order
- `/Users/abelsanchez/CODEX/WONDERLAND/styles.css`: static shell + modal styling
- `/Users/abelsanchez/CODEX/WONDERLAND/narrative.js`: narrative/UI copy data map (`window.AI_POWER_USER_NARRATIVE`)
- `/Users/abelsanchez/CODEX/WONDERLAND/src/core.js`: constants, tokens, base state, utility helpers
- `/Users/abelsanchez/CODEX/WONDERLAND/src/content.js`: floor content, enemy defs, narrative adapters, lesson text utilities, bomb briefing copy
- `/Users/abelsanchez/CODEX/WONDERLAND/src/upgrades.js`: upgrade engine, stack state, derived stat computation
- `/Users/abelsanchez/CODEX/WONDERLAND/src/share.js`: share modal behavior, copy builder, run-card PNG generator
- `/Users/abelsanchez/CODEX/WONDERLAND/src/systems.js`: state transitions, input handlers, simulation/update logic
- `/Users/abelsanchez/CODEX/WONDERLAND/src/render.js`: all drawing (world, HUD, overlays, title/upgrade/briefing screens)
- `/Users/abelsanchez/CODEX/WONDERLAND/src/main.js`: main loop bootstrap (`requestAnimationFrame`)

## Fixed canvas + world

From `src/core.js`:
- Canvas: `1280 x 720`
- Corridor rect: `x=132, y=104, w=1016, h=560`
- Wall width: `92`
- Playable world rect is derived from corridor constants.

## Game states

From `src/core.js`:
- `TITLE`
- `UPGRADE_SELECT`
- `BOMB_BRIEFING`
- `FLOOR_INTRO`
- `PLAYING`
- `DEATH_ANIM`
- `FLOOR_CLEAR`
- `GAME_OVER`
- `VICTORY`

### State flow

- New run:
  - `TITLE -> UPGRADE_SELECT -> (optional BOMB_BRIEFING) -> FLOOR_INTRO -> PLAYING`
- Between floors:
  - `PLAYING (timer hits 0) -> FLOOR_CLEAR -> UPGRADE_SELECT -> ...`
- Final clear:
  - `FLOOR_CLEAR (floor 9) -> VICTORY`
- Death flow:
  - `PLAYING (HP <= 0) -> DEATH_ANIM -> GAME_OVER`

## Controls

### Global / by state

- `WASD`: movement in gameplay states
- Movement input is normalized internally to `KeyW/KeyA/KeyS/KeyD` (keyboard `event.code`) to prevent case/Shift key-latch drift.
- `Arrow keys`: shoot direction
- `~` or `` ` ``: toggle debug stats line

### Title (`TITLE`)

- `Enter` / `Space`: start run
- `T`: open Source Text modal
- `R`: clear checkpoint and force start from Floor 1

### Upgrade Select (`UPGRADE_SELECT`)

- `1/2/3`: instant select + confirm corresponding card
- `A/D` or `Left/Right`: change selected card
- `Enter` / `Space`: confirm selected card
- `Esc`: no skip (shows notice)
- Mouse hover: highlights option
- Mouse click: confirms option

### Bomb Briefing (`BOMB_BRIEFING`)

- `Enter`: progresses acceptance counter
- Requires `3` Enter presses before continuing

### Floor Intro (`FLOOR_INTRO`)

- `Enter` / `Space`: skip intro timer

### Playing (`PLAYING`)

- `Space`: use bomb (Escalation Pulse) if charges remain

### End states

- `R`: restart from title on `GAME_OVER` / `VICTORY`

## Core gameplay systems

### Player baseline stats

From `src/core.js`:
- Move speed: `238`
- Fire cooldown: `0.14s`
- Bullet radius: `4`
- Bullet speed: `528`
- Bullet pierce base: `0`
- Max HP base: `3`
- Post-hit invuln base: `0.8s`

### Simulation timing

From `src/systems.js`:
- Fixed simulation step: `1/60`
- Accumulator clamp: `0.25s`

### Health, damage, shield, invulnerability

- HP is heart-based (`hearts`, `maxHearts`).
- Damage is ignored when invulnerable or in non-damage states.
- If shield charges exist, damage consumes shield first.
- After hit or shield break, invulnerability duration uses upgrade-derived value.
- On floor start, player heals `+1` up to max.

### Shooting + directional burst mechanic

- Shooting uses `Arrow key` direction (last pressed shoot key retained).
- Floor `1`: normal directional shots only.
- Floors `2-7`: if the same shoot direction is held for `>= 2.0s` in `PLAYING`, each shot fires both forward and backward.
- Floors `8-9`: if the same shoot direction is held for `>= 10.0s` in `PLAYING`, each shot fires in all four cardinal directions.
- Player and enemy bullets use the cogsec palette (`yellow`, `blue`, `mint`, `pink`), with deterministic cycling per volley/spawn.
- Tier hints appear once per run (`Dual`, then `Omni`) for `4.2s`.

### Bomb (Escalation Pulse)

- Trigger: `Space` in `PLAYING` only
- Input behavior: one activation per physical key press; held-key repeat events are ignored
- Effect on use:
  - Clears all `enemies`
  - Clears all `enemyBullets`
  - Adds removed enemy count to `kills`
  - Plays short flash (`0.22s`) and burst particles
- Charges per floor:
  - Floors `1-4`: `1`
  - Floors `5-6`: `2`
  - Floors `7-9`: `3`
- Charges reset at each floor start.

### Bomb briefings

Briefings are shown once per run at key milestones:
- Floor `1`: intro briefing
- Floor `5`: upgrade briefing (`2 charges`)
- Floor `7`: final upgrade briefing (`3 charges`)

All use Enter x3 acceptance and then continue to floor intro.

### Pickups

- Hearts spawn at floor start and from enemy defeats (chance-based).
- Pickup collection heals +1 up to max HP.
- Magnet pull applies when `magnet_hands` stacks are active.

### Enemy bullets

- Created by ranged enemies and boss patterns.
- Velocity is multiplied by upgrade-derived enemy bullet speed multiplier (`slowmo_aura`).

### Floor timer and completion

- `PLAYING` decrements floor timer.
- At timer end: `FLOOR_CLEAR` (`2.2s`) then next floor.
- At final floor clear: `VICTORY` and checkpoint reset.

## Upgrades

Upgrade stacks persist during a run and reset on new run.

### Option roll behavior

At each floor start (`UPGRADE_SELECT`):
- Rolls 3 options
- Excludes maxed upgrades
- Avoids duplicates
- Prefers diversity (offense + defense/utility when available)
- If needed, fills with fallback options:
  - `Patch Job` (`fallback_heal`): instant heal +1
  - `Breathe` (`fallback_gold`): +0.05s floor invuln bonus (capped)

### Upgrade list (effects from code)

- `comfy_soles` (display: Faster practice)
  - `+6%` move speed per stack, max `5`
- `quick_trigger` (Fast feedback)
  - `-6%` fire cooldown per stack (multiplicative), max `6`
- `wide_shots` (Wider decision line)
  - `+10%` bullet radius per stack, max `6`
- `fast_rounds` (More practice cycles)
  - `+8%` bullet speed per stack, max `5`
- `ghost_rounds` (Skip path)
  - `+1` pierce per stack, max `3`
- `heart_container` (Error room)
  - `+1` max HP per stack, immediate heal +1 on apply, max `3`
- `bubble_shield` (Safety rule)
  - floor-start shield charges, max `2` stacks, total floor shield charges clamped to `2`
- `grace_frames` (Reset window)
  - `+0.10s` invulnerability bonus per stack, max `4`
- `magnet_hands` (Data pull)
  - `+40px` pickup magnet radius per stack, max `5`
- `slowmo_aura` (Slow noise)
  - enemy bullet speed `x0.93` per stack (multiplicative), max `5`

## Floor content (1-9)

Each floor has:
- unique duration
- accent color (`yellow`, `blue`, `mint`, `pink`)
- unique arena visual color signature (lead + support CogSec colors)
- heart type/icon style
- enemy wave schedule with per-wave spawn-rate and speed scaling

Floor definitions are in `src/content.js` (`FLOORS`).

- Floor 1 `Invocation Corridor` (`48s`, yellow)
- Floor 2 `Tool Discovery Run` (`52s`, blue)
- Floor 3 `Prompt Loop Feed` (`56s`, mint)
- Floor 4 `Workflow Sync Lane` (`60s`, pink)
- Floor 5 `Stack Builder Hall` (`64s`, yellow)
- Floor 6 `Automation Loop` (`70s`, blue)
- Floor 7 `Mirror Workflow` (`76s`, mint)
- Floor 8 `Integration Threshold` (`84s`, pink)
- Floor 9 `Power User Emergence` (`92s`, yellow)
- Floors `8-9` have a mild pressure ramp (spawn-rate/speed tuning) to offset omni burst availability.

## Enemy catalog (definitions)

From `ENEMY_DEFS` in `src/content.js`:

- `signal_echo`: hp 2, size 15, speed 82, chase
- `rabbit_glimpse`: hp 1, size 12, speed 128, dash
- `notification_swarm`: hp 1, size 10, speed 104, swarm
- `name_glitch_shade`: hp 2, size 14, speed 88, phase
- `flank_drone`: hp 2, size 12, speed 96, ranged, projectile behavior
- `speaker_wraith`: hp 3, size 15, speed 78, ranged
- `chair_knight`: hp 4, size 17, speed 72, tank
- `hammer_rabbit`: hp 5, size 16, speed 108, charge
- `loop_ghost`: hp 2, size 13, speed 98, chase
- `decay_mote`: hp 1, size 8, speed 152, swarm
- `double`: hp 5, size 15, speed 116, mirror
- `apex_rabbit`: hp 6, size 17, speed 126, charge, touch damage 2
- `cell_blob`: hp 2, size 11, speed 88, blob, can split
- `reach_shadow`: hp 3, size 13, speed 0, wallhand, touch damage 2
- `evolution_rabbit`: hp 10, size 19, speed 122, boss

Behavior logic is implemented in `updateEnemies()` and helpers in `src/systems.js`.

## Narrative and teaching layer

### Narrative source

- Global narrative object: `window.AI_POWER_USER_NARRATIVE` in `narrative.js`
- Used for:
  - title copy
  - floor copy
  - upgrade display renames/descriptions
  - outcome copy
  - share copy templates

### Upgrade-screen teaching panel

- Right-side teach panel is driven by `buildTeachCardForUpgrade()` in `src/content.js`.
- Current teach panel output includes:
  - title
  - one-liner
  - up to 3 bullets
- `exampleLabel` / `exampleText` currently return empty strings (the "From your text" block is removed).

### Source text modal

- Open with `T` on title.
- Allows Save / Use sample / Close.
- Persisted in `localStorage` key `LESSON_TEXT_V1`.
- Normalization:
  - trim
  - collapse whitespace
  - max `4000` chars

## Checkpoint and persistence

### Checkpoint floor

- Key: `checkpoint_floor_v1`
- On death, stores current floor id.
- Next run starts from checkpoint floor.
- On victory, checkpoint is cleared.
- On title, `R` clears checkpoint and starts at Floor 1.

### Share modal preference

- Key: `dontAskShare`
- If enabled, share modal is suppressed.

## Share flow

- On first entry to `GAME_OVER`, share modal opens (unless suppressed).
- Share modal features:
  - copy post text
  - open LinkedIn (official offsite URL if share URL available, otherwise feed)
  - download generated run card image (`1200x627`)
  - optional native share button on touch/compact devices

Share copy generation:
- Uses `buildShareCopy()` in `src/share.js`
- Includes floor reached, neural-net loop line, optional upgrade summary, and disclosure line.

## Render and UI details

### Rendering structure

- Main draw loop in `src/main.js`
- Render entry in `AIPU.render.draw()`
- Environment + entities + HUD + overlays are layered in `src/render.js`
- Arena visuals now resolve per-floor themes (unique signatures for Floors 1-9).
- Floors `5-9` progressively increase trippy visual layering/motion in the arena only.
- Mechanics/stats are unchanged (render-only update).

### Render cache

- Enabled by `RENDER_CACHE_ENABLED`
- Static and dynamic offscreen layers cached per floor/accent
- Invalidation on floor/state transitions via `AIPU.renderCache`

### Art folder contract

Character art now resolves from folders first, with legacy fallback for player files.

- Base paths:
  - Player: `assets/characters/player/main/`
  - Enemy: `assets/characters/enemies/<enemyType>/`
- Required player files:
  - `front.png`, `back.png`, `left.png`, `right.png`
- Optional enemy files:
  - `idle.png` (primary)
  - `default.png` (fallback if `idle.png` is missing)
- Fallback behavior:
  - Missing files resolve through fallback candidates.
  - No valid image path falls back to procedural rendering for that entity.
  - Path cache is versioned for hard refreshes using `v=20260216-5`.
- Debug:
  - `AIPU.render.getSpriteLoadState()` returns runtime sprite cache counters and missed-path diagnostics.
- Adding new character types or replacements:
  - Add the correct folder under `assets/characters/enemies/<enemyType>/`.
  - Drop `idle.png` (and optional `default.png`) to enable auto-routing on next frame load.

### HUD elements

- Hearts + optional shield pill
- Survival timer bar
- Floor pill
- Bomb status pill with segmented charge meter
- Burst status panel (`Normal`/`Dual`/`Omni`) with progress to next tier
- Upgrade mini-panel (top-right)
- Optional burst-tier hint panel
- Optional debug stats panel

### Overlays

- `UPGRADE_SELECT`: 3 cards + teach panel
- `BOMB_BRIEFING`: modal-like instructional panel (intro/2-charge/3-charge variants)
- `FLOOR_INTRO`, `FLOOR_CLEAR`: centered overlay
- `DEATH_ANIM`: impact ring + shard burst + white resolve fade
- `GAME_OVER`/`VICTORY`: run summary with:
  - floors cleared
  - upgrades taken
  - "What you learned" bullets
  - threat glossary rows

## Accessibility and motion

- Reduced motion preference (`prefers-reduced-motion`) is read and used for:
  - title animation simplification
  - death shard count/duration adjustments
- Modals are keyboard-focus aware and trap Tab while open.

## Debug and development notes

- Debug derived-stat line toggle: ``~``
- `console.log("[narrative] loaded:", ...)` prints on content load
- Upgrade pick logging occurs only when debug toggle is enabled

## Manual verification checklist

1. Title:
- Enter starts run
- T opens Source Text modal
- R clears checkpoint and starts at Floor 1

2. Floor start loop:
- Upgrade select appears each floor
- Picking upgrade continues to bomb briefing when applicable
- Floor intro then gameplay starts

3. Bomb progression:
- Floor 1-4: 1 charge
- Floor 5-6: 2 charges
- Floor 7-9: 3 charges
- Space only works in PLAYING

4. Directional burst:
- Hold same shoot direction >=2s: forward + backward shot
- Hold same shoot direction >=10s: shots in all 4 directions
- Bullets cycle through cogsec colors
- Tier hints appear on first unlock in run

5. Death/share:
- lethal hit -> death animation -> game over
- share modal opens (unless suppressed)
- copy/open/download buttons work

6. Checkpoint:
- die on floor N, restart, run starts at floor N
- victory clears checkpoint
