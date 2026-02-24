---
status: pending
priority: p3
issue_id: "020"
tags: [code-review, clarity]
dependencies: []
---

# Clarify useScoreAndChunks initialized=1 vs countdown

## Problem Statement

The init effect in useScoreAndChunks sets `refs.initialized.value = 1`. GameCanvas's countdown effect then sets it to 0 and later back to 1. So the "1" from useScoreAndChunks is immediately overwritten on mount; the real gate is the countdown. Misleading when reading "who starts the sim."

## Findings

- **useScoreAndChunks.ts** (77–78): `refs.initialized.value = 1` in init effect.
- **GameCanvas.tsx** (225–256): Countdown effect sets initialized 0 then 1.

## Proposed Solutions

### Option 1: Remove from useScoreAndChunks

**Approach:** Remove `refs.initialized.value = 1` from this effect; let only the countdown set it. Document that countdown is the authority.

**Pros:** Single source of truth.  
**Cons:** Ensure no path relies on useScoreAndChunks setting it first.  
**Effort:** Small. **Risk:** Low.

### Option 2: Comment only

**Approach:** Add a short comment that countdown is the authority and this is for reset/remount only.

**Pros:** No behavior change.  
**Cons:** Redundant write remains.  
**Effort:** Trivial. **Risk:** None.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useScoreAndChunks.ts` (77–78), `components/GameCanvas.tsx` (countdown effect)

## Acceptance Criteria

- [ ] Intent documented or redundant initialized=1 removed

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** pattern-recognition-specialist.
