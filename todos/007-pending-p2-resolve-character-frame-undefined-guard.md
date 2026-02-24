---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, typescript, correctness]
dependencies: []
---

# resolveCharacterFrame can return undefined if RUN_FRAMES.length === 0

## Problem Statement

`RUN_FRAMES[frameIndex % RUN_FRAMES.length]` is typed as `SpriteFrame`, but if `RUN_FRAMES.length === 0` the result is `undefined`. `CharacterSpritePreset` allows `readonly SpriteFrame[]` to be empty.

## Findings

- **useWorldPictures.ts** (32–49): `resolveCharacterFrame` uses `RUN_FRAMES[frameIndex % RUN_FRAMES.length]`; no guard for empty array.
- Type system does not enforce non-empty arrays for preset frame arrays.

## Proposed Solutions

### Option 1: Runtime guard + fallback

**Approach:** Use `RUN_FRAMES[frameIndex % Math.max(1, RUN_FRAMES.length)] ?? IDLE_FRAMES[0]` (or similar) and ensure return type is `SpriteFrame`.

**Pros:** Safe at runtime.  
**Cons:** Fallback behavior must be defined.  
**Effort:** Small. **Risk:** Low.

### Option 2: Type-level non-empty array

**Approach:** Define preset type so `runFrames` and `idleFrames` are non-empty (e.g. tuple or branded type). Guarantee in characterSpritePresets that arrays are non-empty.

**Pros:** Compiler enforces; no runtime guard needed.  
**Cons:** May require preset type changes.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useWorldPictures.ts` (32–49), `components/game/characterSpritePresets.ts` (types)

## Acceptance Criteria

- [ ] resolveCharacterFrame never returns undefined; type is SpriteFrame
- [ ] Empty preset arrays either disallowed by type or handled with fallback

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** kieran-typescript-reviewer flagged possible undefined return.
