---
status: pending
priority: p2
issue_id: "014"
tags: [code-review, duplication, game]
dependencies: []
---

# Extract shared worklet for character and opponent transform

## Problem Statement

Player and opponent transform logic in useWorldPictures (scale, feetTrim, baseY, gravity flip) is duplicated; only position and “scale boost” differ. Duplication risks drift and makes tuning harder.

## Findings

- **useWorldPictures.ts** (156–186 player, 188–215 opponent): Same steps—resolve frame → scale, feetTrim, render size → baseX/baseY → gravity flip and val.set(...).

## Proposed Solutions

### Option 1: Shared worklet helper

**Approach:** Extract a worklet (or shared helper used by both worklets) that takes posX, posY, gravityDir, and applyJumpScaleBoost (boolean), returns RSXform values. Call from both characterTransforms and opponentTransforms.

**Pros:** Single place for transform math; easier to tune.  
**Cons:** Refactor of two call sites.  
**Effort:** Medium. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useWorldPictures.ts` (155–215)

## Acceptance Criteria

- [ ] One shared transform computation; player and opponent use it with different inputs
- [ ] Visual behavior unchanged

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** pattern-recognition-specialist, code-simplicity-reviewer.
