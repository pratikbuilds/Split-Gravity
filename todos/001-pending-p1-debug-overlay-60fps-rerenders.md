---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, performance, architecture]
dependencies: []
---

# Debug overlay causes 60 re-renders/sec when collider debug UI is on

## Problem Statement

When `ENABLE_COLLIDER_DEBUG_UI` is true, GameCanvas (and the entire Skia Canvas tree) re-renders up to 60 times per second. This violates AGENTS.md: "Only setChunks should trigger GameCanvas re-renders" and "Never put frequently-changing values in React state inside GameCanvas." It also causes ~60 `scheduleOnRN` calls per second.

## Findings

- **GameCanvas.tsx** (lines 75, 286–325, 367–414): `useAnimatedReaction` preparer returns a **new object every frame** (playerX, playerY, velocityY, etc.). Reanimated uses shallow compare, so the reaction runs every frame and calls `scheduleOnRN(setDebugOverlay, next)` → full GameCanvas re-render at 60fps.
- AGENTS.md pitfall #5: "Prefer single numeric buckets when possible"; "scheduleOnRN is expensive — minimize usage."

## Proposed Solutions

### Option 1: Throttle + isolate debug overlay

**Approach:** Use a bucketed preparer (e.g. `Math.floor(refs.totalScroll.value / 60)` or frame-based) and move debug overlay into a `React.memo` component that subscribes via its own throttled `useAnimatedReaction`, same pattern as ScoreOverlay.

**Pros:** GameCanvas never re-renders for debug; aligns with existing overlay pattern.  
**Cons:** Debug updates at lower rate.  
**Effort:** Small. **Risk:** Low.

### Option 2: Draw debug on UI thread (Skia)

**Approach:** Draw debug lines/rects inside Skia (e.g. in a `useDerivedValue`/Picture that reads SharedValues). No React state for debug.

**Pros:** Zero bridge calls and zero re-renders for debug.  
**Cons:** More refactor; debug UI becomes Skia-only.  
**Effort:** Medium. **Risk:** Low.

### Option 3: Only register reaction when debug on

**Approach:** Conditionally register the `useAnimatedReaction` only when `ENABLE_COLLIDER_DEBUG_UI` is true, and use a throttled preparer (single numeric bucket) so when it does run, it doesn’t fire every frame.

**Pros:** No work when debug off; when on, reduced rate.  
**Cons:** Still need throttling to avoid 60fps when on.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/GameCanvas.tsx` (75, 286–325, 367–414)
- **Related:** AGENTS.md performance rules 1, 2, 4

## Acceptance Criteria

- [ ] When `ENABLE_COLLIDER_DEBUG_UI` is true, GameCanvas does not re-render every frame
- [ ] `scheduleOnRN(setDebugOverlay, …)` is not called every frame when debug is on
- [ ] Debug overlay still shows useful collider/position data (possibly at lower update rate)

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** Multi-agent review (pattern-recognition, architecture-strategist, performance-oracle, kieran-typescript-reviewer) identified debug overlay as P1.

**Learnings:** Same finding across four agents; fix is either throttle+isolate or move to Skia.
