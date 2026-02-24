---
status: pending
priority: p3
issue_id: "017"
tags: [code-review, naming]
dependencies: []
---

# Align character preset and asset naming with branch (dog)

## Problem Statement

Branch is `feature/dog-character-actions` but preset is `TRUMP_CHARACTER_PRESET` and image is `v3.png`. Naming suggests a different character and hurts searchability.

## Findings

- **characterSpritePresets.ts** (27, 61, 28): TRUMP_CHARACTER_PRESET, v3.png; branch implies dog character.

## Proposed Solutions

### Option 1: Rename to dog

**Approach:** If this is the dog character, rename to e.g. `DOG_CHARACTER_PRESET` and use `dog_character.png` (or the intended asset).

**Pros:** Clear and consistent.  
**Cons:** Requires asset/name alignment.  
**Effort:** Small. **Risk:** Low.

### Option 2: Leave as-is

**Approach:** Keep names; document or ignore if intentional.

**Effort:** None.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/characterSpritePresets.ts`

## Acceptance Criteria

- [ ] Naming consistent with intent (dog vs other) or documented

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** pattern-recognition-specialist.
