---
status: pending
priority: p3
issue_id: "021"
tags: [code-review, security]
dependencies: []
---

# Validate match:result payload on client

## Problem Statement

`match:result` is stored in state and used for UI. No check that winnerPlayerId, loserPlayerId, reason, endedAt are present and of expected type. Malformed server payload could break UI.

## Findings

- **matchController.ts** (191–198): match:result handler sets state without validating shape/types.

## Proposed Solutions

### Option 1: Validate shape before setState

**Approach:** Validate shape and types (and optionally known reason enum) before calling setState. Ignore or fallback for invalid payloads.

**Pros:** Resilient to bad server data.  
**Cons:** Slight overhead.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `services/multiplayer/matchController.ts`

## Acceptance Criteria

- [ ] match:result payload validated before updating state; invalid payloads handled safely

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** security-sentinel.
