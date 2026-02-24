---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, typescript, quality]
dependencies: []
---

# gravityDirection should be typed as 1 | -1

## Problem Statement

`gDir` (from `refs.gravityDirection.value`) is used as `1 | -1` throughout physics and simulation (e.g. `gDir === 1`, `gDir === -1`). The type is `SharedValue<number>`. If anything ever sets another value, behavior is undefined and the compiler won't catch it.

## Findings

- **useGameSimulation.ts** (e.g. 237, 251): `gDir` from `refs.gravityDirection.value`; code assumes `1 | -1`.
- **components/game/types.ts:** `SimulationRefs` defines `gravityDirection` as `SharedValue<number>`.

## Proposed Solutions

### Option 1: Narrow type in SimulationRefs

**Approach:** In `types.ts`, change `gravityDirection: SharedValue<number>` to `gravityDirection: SharedValue<1 | -1>`. Ensure all assignments (e.g. in useGameGestures, useGameSimulation) use literal `1` or `-1`.

**Pros:** Type-safe; compiler catches invalid values.  
**Cons:** May need casts at assignment sites if coming from number.  
**Effort:** Small. **Risk:** Low.

### Option 2: Branded type

**Approach:** Define `type GravityDirection = 1 | -1` and use `SharedValue<GravityDirection>`.

**Pros:** Same as Option 1; name documents intent.  
**Cons:** One extra type export.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/types.ts`, `components/game/useGameSimulation.ts`, `components/game/useGameGestures.ts`
- **Related:** Exhaustive switch / union handling (cursor rule)

## Acceptance Criteria

- [ ] `gravityDirection` is typed as `SharedValue<1 | -1>` (or equivalent)
- [ ] All assignments use `1` or `-1`; TypeScript compiles without error

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** kieran-typescript-reviewer flagged missing type narrow for gravity direction.
