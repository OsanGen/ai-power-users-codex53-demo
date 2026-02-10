# AI Power Users - Codex 5.3 Tech Demo (Local Prototype)

Local 2D browser game prototype for an AI tooling rabbit-hole journey, styled with the CogSec pastel visual system.

## Run locally

Option 1:
- Open `index.html` directly in a browser.

Option 2 (recommended):
- From this project folder, run:
  - `python3 -m http.server 4173`
- Open [http://127.0.0.1:4173/index.html](http://127.0.0.1:4173/index.html)

## Controls

- Move: `WASD`
- Shoot: `Arrow Keys` (4 directions)
- Start / Skip floor intro: `Enter` or `Space`
- Upgrade select: `1-3` instant pick, `A/D` or `Left/Right` to move, `Enter`/`Space` to confirm, mouse hover/click supported
- Debug stats toggle: ``~`` (off by default)
- Restart after game over/victory: `R`

## Gameplay

- Survive each floor timer to advance.
- Health is heart-based and partially replenishes between floors (+1 heart, up to max).
- At the start of each floor you must choose 1 upgrade; stackable upgrades persist across the run.
- If upgrade pools run low, safe fallback options can appear (`Patch Job` heal or `Breathe` short iFrame boost for the floor).
- 9 floors progress in sequence with floor-specific enemies, overlays, and corridor skins.

## Narrative layer (neural nets)

- The run uses a rabbit-hole story to teach neural-net concepts, floor by floor.
- Narrative content is data-only in `narrative.js` (titles, subtitles, lore, upgrade labels).
- Core mechanics are unchanged by the narrative layer.
- Floor concepts: weights and bias, data and labels, activations, loss to gradients, capacity and overfitting, optimization loop, generalization, inference reality, emergence and control.

## Mental model

- Input: keyboard and mouse update intent and menu selection.
- Update loop: game state, spawns, collisions, upgrades, and timers update every frame.
- Render loop: canvas draws world, HUD, overlays, and share/death UI from current state.
- Floors progress in order. Upgrades stack for the full run.
- `narrative.js` only changes copy and lore labels.
