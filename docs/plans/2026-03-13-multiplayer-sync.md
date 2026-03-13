# Multiplayer Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make multiplayer opponent rendering deterministic across lobby, countdown, and running phases while fixing stale round state that breaks remote movement updates.

**Architecture:** The server remains phase-authoritative and relays validated player state packets. Each client owns its local runner simulation, sends compact running-state packets with phase/pose metadata, and renders the opponent strictly from the latest accepted remote snapshot plus the authoritative match phase.

**Tech Stack:** Expo, React Native, Reanimated, Skia, Socket.IO, Node test runner

---

### Task 1: Extend the multiplayer state contract

**Files:**

- Modify: `shared/multiplayer-contracts.ts`
- Modify: `server/src/shared/multiplayer-contracts.ts`
- Modify: `types/game.ts`

**Step 1:** Add explicit remote phase, pose, and sequence fields to the shared state packet and opponent snapshot types.

**Step 2:** Keep field names device-independent so remote rendering stays normalized across screen sizes.

**Step 3:** Update comments to reflect that packets describe gameplay state, not raw pixel coordinates.

### Task 2: Reset server round state correctly

**Files:**

- Modify: `server/src/multiplayer/runtime.ts`
- Modify: `server/src/multiplayer/server.ts`
- Test: `server/src/tests/multiplayerRuntime.test.ts`
- Test: `server/src/tests/multiplayerGuards.test.ts`

**Step 1:** Add a small runtime helper that resets per-round player state (`alive`, `lastState`, `lastInputAt`).

**Step 2:** Call that helper when a new match countdown starts so old scroll/state history cannot poison the next round.

**Step 3:** Extend validation tests to cover the new packet shape and add a runtime test for the round reset helper.

### Task 3: Make room state authoritative for countdown recovery

**Files:**

- Modify: `shared/multiplayer-contracts.ts`
- Modify: `server/src/shared/multiplayer-contracts.ts`
- Modify: `server/src/multiplayer/runtime.ts`
- Modify: `services/multiplayer/matchController.ts`

**Step 1:** Include `startedAt` in room snapshots.

**Step 2:** Use `startedAt` in the client controller so reconnects and late room-state updates preserve the correct countdown/running anchor.

### Task 4: Make opponent render state deterministic on the client

**Files:**

- Modify: `services/multiplayer/matchController.ts`
- Modify: `components/game/types.ts`
- Modify: `components/GameCanvas.tsx`
- Modify: `components/game/useWorldPictures.ts`
- Modify: `components/game/useGameSimulation.ts`

**Step 1:** Replace the mount-time opponent defaults with explicit baseline snapshots for lobby/countdown.

**Step 2:** Keep the opponent visible and idle on their assigned lane before the match starts.

**Step 3:** Add explicit remote pose handling so the renderer does not infer pre-start run animation from unrelated flags.

**Step 4:** Send running-state packets with phase, pose, and sequence metadata.

### Task 5: Verify behavior

**Files:**

- Test: `server/src/tests/multiplayerRuntime.test.ts`
- Test: `server/src/tests/multiplayerGuards.test.ts`

**Step 1:** Run `pnpm test:deterministic`.

**Step 2:** Run targeted lint or type checks if the deterministic tests pass cleanly.

**Step 3:** Manually inspect the changed multiplayer files for accidental overlap with unrelated worktree edits before closing out.
