---
status: pending
priority: p2
issue_id: "015"
tags: [code-review, dead-code]
dependencies: []
---

# Remove dead export ScoreChunkState from types

## Problem Statement

`ScoreChunkState` is exported from `components/game/types.ts` but not imported anywhere. Dead public API.

## Findings

- **types.ts** (57–62): Interface exported.
- Grep: no imports of ScoreChunkState.

## Proposed Solutions

### Option 1: Remove export and interface

**Approach:** Delete the interface (or make it non-exported if kept for local use).

**Pros:** Clearer public API.  
**Cons:** None.  
**Effort:** Trivial. **Risk:** None.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/types.ts` (57–62)

## Acceptance Criteria

- [ ] ScoreChunkState removed or not exported; no broken imports

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** code-simplicity-reviewer.
