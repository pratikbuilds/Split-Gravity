---
status: pending
priority: p2
issue_id: "005"
tags: [code-review, performance]
dependencies: []
---

# Bucket useScoreAndChunks scroll reaction preparer

## Problem Statement

The `useAnimatedReaction` in useScoreAndChunks uses preparer `() => refs.totalScroll.value`, so the reaction (and its worklet callback) run every frame (60/sec). `scheduleOnRN(spawnChunks)` is already throttled by the 300-scroll check, but the reaction itself runs 60×/sec unnecessarily. AGENTS.md suggests bucket math to throttle.

## Findings

- **useScoreAndChunks.ts** (114–125): Preparer returns raw scroll; callback sets `scoreValue.value = scroll` and conditionally calls `scheduleOnRN(spawnChunks)`.
- Impact: 60 worklet runs/sec; optional improvement is to set `scoreValue` in the frame callback in useGameSimulation and use a bucketed preparer here only for spawn.

## Proposed Solutions

### Option 1: Bucketed preparer only

**Approach:** Use preparer `() => Math.floor(refs.totalScroll.value / 300)`; in callback read `refs.totalScroll.value` for spawn check and `scoreValue.value` update. Reaction runs only when bucket changes.

**Pros:** Fewer reaction runs; same spawn semantics.  
**Cons:** scoreValue still updated in this reaction (when bucket changes).  
**Effort:** Small. **Risk:** Low.

### Option 2: Bucket + move score to frame callback

**Approach:** Set `scoreValue.value = refs.totalScroll.value` in useGameSimulation frame callback (once per frame). In useScoreAndChunks use preparer `() => Math.floor(refs.totalScroll.value / 300)` and in callback only do spawn logic and `scheduleOnRN(spawnChunks)`.

**Pros:** Score stays in sync every frame without a separate reaction; spawn reaction runs only on bucket change.  
**Cons:** Slight change to where score is written.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useScoreAndChunks.ts` (114–125), optionally `components/game/useGameSimulation.ts`

## Acceptance Criteria

- [ ] Reaction does not run every frame; preparer uses a numeric bucket (e.g. scroll/300)
- [ ] Chunk spawn and score behavior unchanged

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** performance-oracle, pattern-recognition-specialist recommended bucketing.
