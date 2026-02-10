# Audio Generation (ElevenLabs SFX)

This project includes a local generator for gameplay sound effects using the ElevenLabs Sound Effects API.

## Prerequisites

1. ElevenLabs account with Sound Effects API access.
2. `ELEVENLABS_API_KEY` exported in your shell.
3. Node.js 18+ (for native `fetch`).

## Generate the core SFX pack

```bash
export ELEVENLABS_API_KEY=your_api_key_here
pnpm audio:generate:sfx
```

## Force regeneration (overwrite existing files)

```bash
pnpm audio:generate:sfx:force
```

## Outputs

The script writes WAV files to:

- `assets/audio/sfx/flip_gravity.wav`
- `assets/audio/sfx/game_over_stinger.wav`
- `assets/audio/sfx/ui_click.wav`
- `assets/audio/sfx/run_start_whoosh.wav`
- `assets/audio/sfx/land_thud.wav`
- `assets/audio/sfx/near_miss_swoosh.wav`

## Behavior

- Validates `ELEVENLABS_API_KEY` before generation.
- Reads prompt definitions from `scripts/sfx-prompts.json`.
- Skips existing files by default.
- Retries transient failures (network, rate-limit, 5xx).
- Exits with non-zero status if one or more sounds fail.

## Notes

- Script requests PCM audio and wraps it into proper WAV files.
- No runtime game playback code is changed in this step.
- Background music generation is intentionally out of scope for this script.
