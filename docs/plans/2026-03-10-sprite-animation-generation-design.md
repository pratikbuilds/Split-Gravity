# Sprite Animation and Generation Quality Design

**Date:** 2026-03-10  
**Scope:** Generated runner sprite sheets, generated sprite playback alignment, and generation prompt/validation quality.

## Goals

- Make generated `run` rows read like an exaggerated arcade sprint with clear leg interchange and visible arm swing.
- Keep generated `idle` rows stable in place so subtle breathing is allowed but feet and pelvis stay locked to the same baseline.
- Reduce bad generations by tightening prompt instructions and validator checks before the sheet is accepted.
- Make preview playback and in-game playback agree on how generated sheets are framed and aligned.

## Constraints

- Do not modify user-provided sprite images directly.
- Preserve current preset-character behavior unless a shared fix is clearly required.
- Keep the generated-sheet pipeline compatible with the current 6 columns x 3 rows layout.
- Avoid adding a manual per-character correction workflow.

## Chosen Approach

Use a combined generation and playback fix:

1. Tighten the Gemini generation prompt so the model is explicitly asked for an arcade sprint run cycle and a locked idle baseline.
2. Expand validation so sheets are rejected when the idle row drifts or the run row lacks readable sprint mechanics.
3. Normalize generated-sheet framing at runtime so minor per-frame crop variance does not appear as visible drift in previews or gameplay.

## Alternatives Considered

### 1. Prompt-only update

- Fastest change.
- Still leaves visible drift when the model returns inconsistent framing.
- Rejected because it depends too much on perfect generation.

### 2. Manual per-sheet metadata

- Most precise.
- Adds operational overhead and a new content-maintenance path.
- Rejected because it is too heavy for the current generation workflow.

## Design

### 1. Generation quality contract

Update the sprite-generation prompt to require:

- An exaggerated arcade sprint in the `run` row.
- Strong left/right leg interchange with readable contact, passing, and push phases.
- Opposite arm swing on every run frame.
- No jump-like or both-feet-up poses in the run row.
- An `idle` row with subtle breathing only above the pelvis.
- Feet planted and pelvis locked to the same horizontal and vertical position in all idle frames.

Update the inspection contract so failed generations can be rejected for:

- Missing leg crossover or weak leg interchange.
- Missing arm swing.
- Run poses that read like jumping or pouncing.
- Idle pelvis drift.
- Idle foot drift.

Retry feedback should call out those exact failures so regeneration instructions stay specific.

### 2. Generated-sheet playback normalization

For generated sheets, stop treating each cell as a raw equal crop only.

- Derive a visible-content crop from the non-magenta pixels inside each grid cell.
- Compute shared alignment anchors for each action row.
- Lock `idle` frames to a common ground baseline and pelvis anchor.
- Keep `run` frames on a common ground baseline while still allowing stride width changes.

This normalization should be reused by:

- `components/game/useWorldPictures.ts`
- `components/character/CharacterSpritePreview.tsx`

That keeps gallery playback and in-game playback visually consistent.

### 3. Failure handling and verification

- Surface more specific generation failure messages for debugging and prompt iteration.
- Add focused tests for generated frame normalization and baseline locking.
- Add tests for prompt/inspection contract changes so future refactors do not weaken the acceptance gate.

## Out of Scope

- Redesigning preset character sprite sheets.
- Adding artist-authored metadata per generated sheet.
- Changing the 6x3 layout format.
- Adding new character actions beyond `run`, `jump`, `fall`, and `idle`.
