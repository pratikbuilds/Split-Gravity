---
status: pending
priority: p3
issue_id: "018"
tags: [code-review, security]
dependencies: []
---

# Nickname length and sanitization (client and server)

## Problem Statement

Nicknames are only trimmed and given a default; no max length. Very long nicknames could affect memory, layout, or performance when displayed.

## Findings

- **matchController.ts** (291–294, 307–312), **server/src/index.ts** (267–284, 310–373): No max length; stored and sent to other clients; displayed as opponentName.

## Proposed Solutions

### Option 1: Enforce max length

**Approach:** Client and server: enforce max length (e.g. 32–64 chars); server reject or truncate before storing. Optionally restrict character set.

**Pros:** Bounded memory and layout.  
**Cons:** Product decision on limit.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `services/multiplayer/matchController.ts`, `server/src/index.ts`

## Acceptance Criteria

- [ ] Nickname length limited on client and server; display safe

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** security-sentinel.
