---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, simplicity]
dependencies: []
---

# Remove unused opponentVisible and playerX from useWorldPictures

## Problem Statement

`useWorldPictures` returns `opponentVisible` and `playerX`; GameCanvas does not use them. Dead API surface and unnecessary computation.

## Findings

- **useWorldPictures.ts** (393–396, 523–536): Both computed and returned.
- **GameCanvas.tsx** (destructuring ~188–206): Does not destructure or use them; uses `opponentSnapshot?.alive` and `width * OPPONENT_X_FACTOR` / refs for debug.

## Proposed Solutions

### Option 1: Remove from return

**Approach:** Remove `opponentVisible` and `playerX` from the return type and from the return object. Remove any logic that only exists to compute them if it has no other side effects.

**Pros:** Smaller surface; less to maintain.  
**Cons:** None unless something external used them.  
**Effort:** Small. **Risk:** Low.

### Option 2: Use them in GameCanvas

**Approach:** Use `opponentVisible` for conditional opponent rendering and `playerX` for layout or debug instead of recalculating.

**Pros:** Single source of truth.  
**Cons:** Only if you need them.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useWorldPictures.ts`, `components/GameCanvas.tsx`

## Acceptance Criteria

- [ ] Either return value and related logic removed, or GameCanvas uses them consistently

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** pattern-recognition, architecture-strategist, code-simplicity-reviewer, kieran-typescript-reviewer.
