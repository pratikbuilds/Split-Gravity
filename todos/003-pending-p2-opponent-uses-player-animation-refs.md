---
status: done
priority: p2
issue_id: "003"
tags: [code-review, consistency, game]
dependencies: []
---

# Opponent transform uses player animation state

## Problem Statement

The opponent sprite animation (idle/run/jump/fall) is driven by **player** refs (`countdownLocked`, `flipLockedUntilLanding`, `velocityY`, `frameIndex`) instead of opponent-specific state. Opponent position uses `opponentPosY` and `opponentGravity` correctly, but animation mirrors the local player.

## Findings

- **useWorldPictures.ts** (187–215): `opponentTransforms` calls `resolveCharacterFrame(refs.countdownLocked, refs.flipLockedUntilLanding, refs.velocityY, refs.frameIndex)` — all player refs.
- Effect: In multiplayer, opponent appears to animate in sync with the local player, not their own state.

## Proposed Solutions

### Option 1: Add opponent animation refs

**Approach:** Add SharedValues (or derived values) for opponent frame state (e.g. from `opponentSnapshot` or server-sent frame index). Use them in `resolveCharacterFrame` for the opponent path only.

**Pros:** Correct multiplayer animation.  
**Cons:** Requires server to send animation state or derive from scroll/gravity.  
**Effort:** Medium. **Risk:** Low.

### Option 2: Document as intentional

**Approach:** If opponent is intentionally mirroring player animation for simplicity, add a short comment in `useWorldPictures` and close as won't fix.

**Pros:** No code change.  
**Cons:** Misleading in multiplayer.  
**Effort:** Trivial. **Risk:** N/A.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/useWorldPictures.ts` (187–215), possibly `components/game/types.ts` and multiplayer state shape

## Acceptance Criteria

- [x] Either opponent uses own animation state (refs/derived from snapshot) or intent is documented

## Work Log

### 2025-03-06 - Implementation

**Actions:** Implemented Option 1. Extended MatchStatePacket and OpponentSnapshot with `frameIndex`, `velocityY`, `flipLocked`, `countdownLocked`. Client sends animation state via onLocalState; server relays; GameCanvas writes to opponent SharedValues; useWorldPictures uses opponent refs for opponentTransforms, opponentRenderTransform, opponentSprites.

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** pattern-recognition-specialist, architecture-strategist, kieran-typescript-reviewer identified opponent animation bug.
