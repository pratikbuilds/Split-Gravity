---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, quality]
dependencies: []
---

# useGameSimulation accepts width but never uses it

## Problem Statement

`UseGameSimulationArgs` includes `width`; the hook never reads it. Callers (GameCanvas) pass it. Dead parameter adds noise and can mislead future changes.

## Findings

- **useGameSimulation.ts** (129–136): `width` in args; not used in frame callback or effects.
- **GameCanvas.tsx:** Passes `width` into `useGameSimulation(...)`.

## Proposed Solutions

### Option 1: Remove width from hook

**Approach:** Remove `width` from `UseGameSimulationArgs` and from all call sites (GameCanvas). If bounds or layout ever need width, add it back and document.

**Pros:** Clear API.  
**Cons:** None.  
**Effort:** Trivial. **Risk:** None.

### Option 2: Use width for bounds

**Approach:** Use `width` in the simulation (e.g. death margin or scroll bounds) and document in the hook.

**Pros:** Parameter justified.  
**Cons:** Only if product needs it.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useGameSimulation.ts`, `components/GameCanvas.tsx`

## Acceptance Criteria

- [ ] Either width is removed from args and call sites, or it is used and documented

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** kieran-typescript-reviewer flagged unused parameter.
