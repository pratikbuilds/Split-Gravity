---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, performance]
dependencies: []
---

# Throttle multiplayer onLocalState to reduce bridge calls

## Problem Statement

When `onLocalState` is set, `scheduleOnRN(onLocalState, { ... })` runs every 2 frames (~30/sec). Each call crosses the UI→JS bridge and can contribute to jank on lower-end devices.

## Findings

- **useGameSimulation.ts** (320–330): `if (refs.frameIndex.value % 2 === 0)` then `scheduleOnRN(onLocalState, { normalizedY, gravityDir, scroll, alive, score })`.

## Proposed Solutions

### Option 1: Time-based throttle

**Approach:** Throttle by time (e.g. send at most every 100–150 ms) using a SharedValue for last-send time; only call scheduleOnRN when interval elapsed.

**Pros:** Capped rate; still responsive.  
**Cons:** Slightly more state in worklet.  
**Effort:** Small. **Risk:** Low.

### Option 2: Scroll-based throttle

**Approach:** Send only when scroll advanced by N units (e.g. 50), store lastSentScroll in SharedValue.

**Pros:** Tied to game progress.  
**Cons:** May send less often when standing still.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useGameSimulation.ts` (319–328)

## Acceptance Criteria

- [ ] scheduleOnRN(onLocalState, ...) not called more than ~10–15/sec in normal play
- [ ] Multiplayer sync still feels responsive

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** performance-oracle identified ~30 bridge calls/sec.
