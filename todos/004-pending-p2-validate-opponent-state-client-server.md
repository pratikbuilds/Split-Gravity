---
status: pending
priority: p2
issue_id: "004"
tags: [code-review, security]
dependencies: []
---

# Validate opponent state (client and server)

## Problem Statement

Opponent state from the server is not validated. Malformed or malicious payloads (NaN, out-of-range `normalizedY`, invalid `gravityDir`, missing `alive`) can cause NaNs or crashes when used in GameCanvas (e.g. `opponentPosY.value = groundHeight + opponentSnapshot.normalizedY * laneSpan`). Server relays `match:state` without validating types/ranges.

## Findings

- **GameCanvas.tsx** (273–283): Effect writes `opponentSnapshot` into SharedValues with no validation.
- **matchController.ts** (174–188): `OpponentSnapshot` built from `match:opponentState` without checks.
- **server/src/index.ts** (440–497): `match:state` handler forwards payload without validating `normalizedY` in [0,1], `gravityDir` in {1,-1}, or `alive` boolean.

## Proposed Solutions

### Option 1: Validate in matchController + GameCanvas

**Approach:** In matchController, when building `OpponentSnapshot`, coerce/validate: `normalizedY` number in [0,1] (default 0.5), `gravityDir` 1 or -1 (default 1), `alive` boolean. In GameCanvas effect, guard: if snapshot present but any field invalid, don't update SharedValues or set opponentAlive to 0.

**Pros:** Client resilient to bad data.  
**Cons:** Server still relays invalid data.  
**Effort:** Small. **Risk:** Low.

### Option 2: Validate on server only

**Approach:** In server `match:state` handler, validate (and clamp) all fields to MatchStatePacket contract before storing and emitting. Reject or replace invalid payloads.

**Pros:** Single source of truth; all clients get clean data.  
**Cons:** Client still should guard for backwards compatibility.  
**Effort:** Small. **Risk:** Low.

### Option 3: Both (recommended)

**Approach:** Implement Option 1 and Option 2.

**Pros:** Defense in depth.  
**Cons:** Slightly more code.  
**Effort:** Medium. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `services/multiplayer/matchController.ts`, `components/GameCanvas.tsx`, `server/src/index.ts`

## Acceptance Criteria

- [ ] Opponent snapshot validated/clamped when building from server message
- [ ] GameCanvas effect guards against invalid snapshot fields
- [ ] Server validates (or clamps) match:state payload before relaying

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** security-sentinel identified unvalidated opponent state as P2.
