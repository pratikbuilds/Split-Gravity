---
status: pending
priority: p2
issue_id: "013"
tags: [code-review, performance]
dependencies: []
---

# Register debug overlay reaction only when ENABLE_COLLIDER_DEBUG_UI is true

## Problem Statement

When `ENABLE_COLLIDER_DEBUG_UI` is false, the debug overlay useAnimatedReaction still runs every frame, reads many refs, then returns null. Wasted work.

## Findings

- **GameCanvas.tsx** (287–296): Preparer runs every frame; when debug is off it returns null but still executes.

## Proposed Solutions

### Option 1: Conditional reaction

**Approach:** Only register this useAnimatedReaction when `ENABLE_COLLIDER_DEBUG_UI` is true (e.g. conditional hook or early return in preparer that avoids ref reads when false). If constant is build-time, wrap the whole reaction in `if (ENABLE_COLLIDER_DEBUG_UI) { ... }`.

**Pros:** No work when debug disabled.  
**Cons:** Hooks rules: must be unconditional unless using a constant.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/GameCanvas.tsx` (286–325)

## Acceptance Criteria

- [ ] When ENABLE_COLLIDER_DEBUG_UI is false, debug overlay reaction does not run (or does minimal work)

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** performance-oracle.
