---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, simplicity]
dependencies: []
---

# Pass triggerAudioEvent directly instead of wrapper

## Problem Statement

GameCanvas passes `triggerAudioEvent: (event) => triggerAudioEvent(event)` to useGameSimulation and useGameGestures. The wrapper creates a new function every render and adds no behavior over passing `triggerAudioEvent` directly.

## Findings

- **GameCanvas.tsx** (176–177, 184–185): Redundant wrapper in both hook calls.
- `triggerAudioEvent` is already from `useCallback`; hooks narrow event type ('game_over' / 'flip').

## Proposed Solutions

### Option 1: Pass directly

**Approach:** Use `triggerAudioEvent` (no wrapper) in both `useGameSimulation` and `useGameGestures` call sites.

**Pros:** Less noise; same behavior.  
**Cons:** None.  
**Effort:** Trivial. **Risk:** None.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/GameCanvas.tsx` (176–177, 184–185)

## Acceptance Criteria

- [ ] No wrapper arrow; triggerAudioEvent passed directly; audio still fires on game over and flip

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** code-simplicity-reviewer, kieran-typescript-reviewer.
