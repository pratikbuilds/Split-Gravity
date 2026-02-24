---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, correctness]
dependencies: []
---

# spawnChunks can be stale inside useAnimatedReaction

## Problem Statement

The reaction is set up once and closes over `spawnChunks`. When `spawnChunks` changes (e.g. after `width`, `groundY`, or `refs` change), the worklet still calls the previous `spawnChunks` via `scheduleOnRN(spawnChunks)`.

## Findings

- **useScoreAndChunks.ts** (95–110, 114–124): `spawnChunks` is defined with current deps; reaction schedules it. Reaction does not re-register when `spawnChunks` identity changes.

## Proposed Solutions

### Option 1: Ref for latest spawn

**Approach:** Keep a ref updated with the latest spawn logic: `spawnChunksRef.current = spawnChunks`. In the reaction callback schedule `scheduleOnRN(() => spawnChunksRef.current())` so the JS callback runs and invokes the current function.

**Pros:** Always uses latest spawnChunks.  
**Cons:** Ref pattern to maintain.  
**Effort:** Small. **Risk:** Low.

### Option 2: Re-register reaction when spawnChunks changes

**Approach:** If the Reanimated API allows, include `spawnChunks` in the reaction's dependency array so the reaction is re-created when spawnChunks changes. Verify behavior.

**Pros:** No ref.  
**Cons:** May not be supported or may cause extra subscriptions.  
**Effort:** Small. **Risk:** Medium (API-dependent).

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useScoreAndChunks.ts`

## Acceptance Criteria

- [ ] When dimensions or refs change, the next spawn uses the updated spawnChunks logic

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** kieran-typescript-reviewer identified stale closure risk.
