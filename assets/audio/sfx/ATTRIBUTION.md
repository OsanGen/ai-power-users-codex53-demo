# SFX Attribution and Contract

This folder is the drop-in location for runtime SFX files:

- `shoot_soft.wav`
- `damage_soft.wav`
- `impact_disable.wav` (optional, for homing-missile attack-disable impact)

Current code path:

- `src/audio.js` loads these files if present.
- If a file is missing or decode fails, the game uses a quiet retro synth fallback so gameplay never breaks.

Recommended generation tools (GitHub):

- `increpare/bfxr2` (MIT)
- `grumdrig/jsfxr` (Unlicense)
- `KilledByAPixel/ZzFX` (MIT)

Keep effects short and subtle for mix safety:

- shoot: ~60-120ms
- damage: ~120-220ms
- impact_disable: ~140-260ms
