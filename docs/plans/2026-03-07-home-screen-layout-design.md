# Home Screen Layout Redesign

**Date:** 2026-03-07  
**Scope:** HomeScreen.tsx layout, hierarchy, and button system. SOUND toggle remains in App.tsx (position can be refined).

## Goals

- **Balanced:** Character and play actions have equal visual weight.
- **Flow:** Select character → get running (character first, then Single/Multiplay).
- **Characters:** Keep full "Characters" button; style as secondary so play buttons read as primary.

## Design: Hero character + anchored actions (Approach B)

### 1. Structure (top → bottom)

| Zone | Content |
|------|--------|
| **Header** | Runner title + one-line description. Compact. SOUND ON stays absolute top-right (App.tsx). |
| **Hero** | Character sprite (larger, e.g. 260–280px), character name below. Optional: very subtle frame/glow so sprite reads as focus. |
| **Character CTA** | Full "Characters" button — same width as play buttons, secondary style (e.g. outline, or filled but muted so it doesn’t compete). |
| **Anchored bottom** | Fixed bottom band (safe-area aware): "Single Play" and "Multiplay" as two primary buttons (equal weight, e.g. both filled with distinct colors or same style). Equal height, consistent padding. |

No `justify-between`. Use fixed spacing (e.g. 24–32px) between sections so vertical rhythm is predictable.

### 2. Button system

| Button | Role | Style |
|--------|------|--------|
| **Single Play** | Primary CTA | Primary style (e.g. filled, white bg, dark text). |
| **Multiplay** | Primary CTA | Same primary weight as Single Play — both equal "run" actions (e.g. both filled; optional second accent for distinction). |
| **Characters** | Secondary | Full-width button; outline or muted fill (e.g. border white/20, bg slate-900/70) so it's clearly secondary to the two play actions. |

All three: same horizontal padding and height so they feel like one system. Single Play and Multiplay are both primary; Characters is the only secondary action.

### 3. Layout details

- **Container:** `flex-1`, padding (e.g. px-6, pt from safe area, pb above bottom band). No `justify-between`.
- **Content block:** Header block → spacer → hero (sprite + name) → spacer → Characters button → flexible spacer (or `flex-1` with min height) so the bottom band doesn’t crowd the hero on short screens.
- **Bottom band:** Wrapper with `paddingBottom: insets.bottom`, inner `View` with gap between Single Play and Multiplay. Buttons full width of content area, max-width consistent with rest of screen (e.g. max-w-sm or same as Characters).

### 4. Copy (unchanged)

- Title: "Runner"
- Description: "Pick your runner, keep the profile saved, and take that same character into solo or multiplayer matches."
- Button labels: "Characters", "Single Play", "Multiplay"

### 5. Out of scope (for this design)

- SOUND toggle position: can stay as-is or move into header in a later pass.
- CharacterSelectScreen: no change.
- New visuals (gradients, new typography): optional follow-up; this doc focuses on layout and hierarchy.

## Implementation notes

- Use `useSafeAreaInsets()` in HomeScreen for top padding and bottom band padding.
- Remove the current "Selected Character" card; replace with sprite + name + Characters button in the hero zone.
- Ensure touch targets remain ≥ 44pt for all buttons.
