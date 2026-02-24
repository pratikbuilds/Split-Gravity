---
status: pending
priority: p2
issue_id: "012"
tags: [code-review, performance]
dependencies: []
---

# Increase SCORE_DISPLAY_BUCKET to reduce score overlay bridge calls

## Problem Statement

`SCORE_DISPLAY_BUCKET = 10` and preparer `Math.floor(scoreValue.value / 10)` mean the ScoreOverlay reaction (and `scheduleOnRN(setDisplay, …)`) runs every 10 scroll units. At RUN_SPEED 280 that's ~28/sec.

## Findings

- **GameCanvas.tsx** (24, 40–48): ScoreOverlay uses bucket 10; display doesn't need that resolution.

## Proposed Solutions

### Option 1: Increase bucket to 50 or 100

**Approach:** Use `SCORE_DISPLAY_BUCKET = 50` (or 100). Score still looks smooth; bridge calls drop to ~5–6/sec or ~2–3/sec.

**Pros:** Fewer scheduleOnRN calls; aligns with AGENTS.md.  
**Cons:** Score digits update slightly less often.  
**Effort:** Trivial. **Risk:** None.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/GameCanvas.tsx` (constant and/or preparer)

## Acceptance Criteria

- [ ] SCORE_DISPLAY_BUCKET increased (e.g. 50 or 100); score display still acceptable

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** performance-oracle.
