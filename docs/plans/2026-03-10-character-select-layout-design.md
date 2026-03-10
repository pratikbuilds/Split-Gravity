# Character Select Layout Redesign

**Date:** 2026-03-10  
**Scope:** `components/CharacterSelectScreen.tsx` layout, hierarchy, and card system.

## Goals

- **Keep the fun:** Preserve the selected runner preview on-screen, but reduce its footprint.
- **Fix scanning:** Make enough vertical room for multiple runner cards to be visible at once.
- **Unify the list:** Render bundled runners and AI runners with the same card style.
- **Highlight the lab:** Move the AI Runner Lab into a brighter, more intentional top promo card.

## Design: Compact hero + unified runner feed

### 1. Structure (top → bottom)

| Zone               | Content                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Header**         | Existing back button + `Choose Runner` label.                                                    |
| **Compact hero**   | Smaller selected-runner preview, selected name, shorter supporting copy.                         |
| **Lab promo**      | Bright compact `AI Runner Lab` card with icon and short description.                             |
| **Runner feed**    | One vertical list containing both built-in runners and AI runners using the same card treatment. |
| **Primary action** | Existing `Save Runner` CTA anchored at the bottom of the screen layout.                          |

### 2. Compact hero

- Reduce the preview size from the current large hero treatment to a tighter format so the list gets materially more height.
- Keep the selected runner name directly under the preview.
- Shorten the helper copy so it explains the screen without occupying multiple lines of vertical space.
- Preserve the current visual language: dark split background, strong type, orange highlights.

### 3. AI Runner Lab treatment

- Replace the current full-width button with a smaller feature card placed near the top of the content stack.
- Add an icon so the call-to-action reads like a destination, not just another row in the list.
- Increase contrast and brightness versus the existing button so it reads as a highlighted tool.
- Keep it compact enough that it does not steal space from the actual runner list.

### 4. Unified runner cards

- Remove the boxed `My AI Characters` gallery section entirely.
- Build one shared card style for every runner entry:
  - title
  - short status text
  - right-side selection badge
- AI-generated runners should not show a thumbnail in the list.
- AI-generated runners should instead carry a small `AI` marker so they remain distinguishable without becoming a separate section.
- Selected cards should keep the orange highlight treatment already used by the current screen.

### 5. Scroll behavior

- The feed should take the full remaining vertical space between the top stack and the bottom save action.
- The layout should show multiple cards at once on normal phone heights.
- Keep a single vertical scroll interaction instead of nested or horizontal strips.

## Out of scope

- Character generation flow changes in `CharacterGenerationScreen.tsx`
- New filtering, search, or sorting controls
- Changes to how the selected runner is saved

## Implementation notes

- Build a single list model inside `CharacterSelectScreen.tsx` that merges built-in presets and custom AI characters.
- Keep selection state behavior unchanged: selecting an AI runner still maps to `characterId: 'custom'` plus the selected custom character.
- Use the existing icon dependency already present in the app rather than adding a new package.
