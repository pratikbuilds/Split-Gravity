# Generation Job Preview Reframing

**Date:** 2026-03-10  
**Scope:** `components/character/CharacterSpritePreview.tsx` framing behavior for `components/character-generation/GenerationJobCard.tsx`.

## Goals

- **Correct the preview:** Make Recent Jobs show the generated runner with a tighter idle framing.
- **Localize the change:** Apply the new crop only in Recent Jobs.
- **Preserve current behavior elsewhere:** Do not alter character previews on the home screen, character select screen, or other surfaces.

## Design: Recent Jobs-only preview mode

### 1. Preview behavior

- Keep the existing idle-action preview for generated characters.
- Add a Recent Jobs-only mode that zooms the idle frame by roughly 50%.
- Shift the render upward so the card reads as a top/front character portrait rather than a full-body tile.

### 2. Component API

- Extend `CharacterSpritePreview` with a narrow preview mode prop.
- The default mode preserves the current framing logic.
- A `jobCard` mode applies the tighter crop and upward composition.

### 3. Screen integration

- Update `GenerationJobCard` to opt into the new `jobCard` mode.
- Keep all other `CharacterSpritePreview` usages on the default mode.

## Out of scope

- Changing preview animation timing
- Changing preset character previews on other screens
- Adding separate portrait assets or thumbnail generation

## Implementation notes

- Reuse the existing idle frame extraction logic for custom sheets.
- Implement the framing change in the render transform rather than duplicating sprite parsing logic in the card.
- Keep the prop surface small so the preview component does not become a generic free-form crop system.
