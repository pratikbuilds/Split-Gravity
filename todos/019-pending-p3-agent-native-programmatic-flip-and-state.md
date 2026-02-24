---
status: pending
priority: p3
issue_id: "019"
tags: [code-review, agent-native]
dependencies: []
---

# Agent-native parity: programmatic flip and observable game state

## Problem Statement

All primary actions (flip, start single/multi, lobby) are UI-only with no programmatic or testable API. Game state (score, death, opponent) is not exposed to an external agent or tests.

## Findings

- **useGameGestures.ts:** Flip only via Gesture.Tap; no imperative API.
- **GameCanvas / App:** Score in SharedValue + overlay; lastResult/gameOver in local state; no ref or subscribe for agents.
- **MatchController:** Has createRoom, joinRoom, readyUp, getState but not exposed (e.g. ref or __DEV__ global).

## Proposed Solutions

### Option 1: Minimal programmatic API

**Approach:** (1) GameCanvas forwardRef + useImperativeHandle({ triggerFlip }) that runs same logic as tap when conditions allow. (2) Expose minimal game session API: ref or context with getScore(), getGameOver(), getLastResult(), getOpponentSnapshot() or subscribe(state => …). (3) Expose MatchController in __DEV__ for tests. (4) Add testID to key buttons (Single Play, Multiplay, Exit, Restart, Create Room, Join Room, Ready).

**Pros:** Agents/tests can drive and assert.  
**Cons:** More surface; mainly for test/automation.  
**Effort:** Medium. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/GameCanvas.tsx`, `components/game/useGameGestures.ts`, `App.tsx`, `components/HomeScreen.tsx`, `components/multiplayer/LobbyScreen.tsx`

## Acceptance Criteria

- [ ] Programmatic flip available (e.g. ref.triggerFlip())
- [ ] Game state readable (score, game over, result)
- [ ] testIDs on main actions; optional MatchController exposure in dev

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** agent-native-reviewer.
