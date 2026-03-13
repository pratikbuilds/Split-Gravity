# Multiplayer Start Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make both multiplayer characters begin from the same world start point and reduce perceived lag in remote jumps and movement.

**Architecture:** Keep the existing state-relay model, but remove synthetic start drift by seeding countdown/running baselines at the same canonical `worldX` and treating the first live running opponent packet as an authoritative alignment point. Keep buffered playback, but shorten the interpolation delay and update pose/gravity state from the newest packet immediately while smoothing only position.

**Tech Stack:** React Native, Expo, Reanimated shared values/worklets, Skia renderer, Socket.IO multiplayer controller, Jest server-side tests

---

### Task 1: Lock start-state behavior in controller logic

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/services/multiplayer/matchController.ts`
- Test: `/Users/pratik/development/mobile/my-expo-app/server/src/tests/opponentPlayback.test.ts`

**Step 1: Write the failing test**

Add a test that documents the expected start behavior:

```ts
it('treats countdown and fresh running state as starting from canonical world origin', () => {
  expect(/* baseline worldX */).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir /Users/pratik/development/mobile/my-expo-app/server test -- opponentPlayback`
Expected: FAIL because the current logic preserves prior opponent `worldX` in fresh run setup paths.

**Step 3: Write minimal implementation**

In `buildBaselineOpponentSnapshot`:
- reset `worldX` to `0` for lobby, countdown, and fresh running baseline creation
- preserve only lane/gravity distinction before live state arrives

In room sync/start handling:
- keep emitting countdown baseline
- do not invent a non-zero start position for the remote player

**Step 4: Run test to verify it passes**

Run: `pnpm --dir /Users/pratik/development/mobile/my-expo-app/server test -- opponentPlayback`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/pratik/development/mobile/my-expo-app/services/multiplayer/matchController.ts /Users/pratik/development/mobile/my-expo-app/server/src/tests/opponentPlayback.test.ts
git commit -m "fix: align multiplayer start baseline"
```

### Task 2: Make first live running packet authoritative in playback

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/game/useOpponentPlayback.ts`

**Step 1: Write the failing test**

Document the playback expectation in a small helper-style test or targeted playback unit:

```ts
it('snaps from synthetic countdown state to first live running state', () => {
  expect(/* first live sample worldX */).toBe(/* current packet worldX */);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir /Users/pratik/development/mobile/my-expo-app/server test -- opponentPlayback`
Expected: FAIL because first running state is currently blended like a normal packet transition.

**Step 3: Write minimal implementation**

In `useOpponentPlayback`:
- detect synthetic-to-live transition:
  - previous/current snapshot is countdown-locked or non-running
  - incoming snapshot is live running
- clear interpolation history for that transition
- use the first live running packet as the active anchor instead of blending from countdown baseline

**Step 4: Run test to verify it passes**

Run: `pnpm --dir /Users/pratik/development/mobile/my-expo-app/server test -- opponentPlayback`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/pratik/development/mobile/my-expo-app/components/game/useOpponentPlayback.ts /Users/pratik/development/mobile/my-expo-app/server/src/tests/opponentPlayback.test.ts
git commit -m "fix: snap opponent to first live running state"
```

### Task 3: Reduce visible remote movement lag

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/game/useOpponentPlayback.ts`

**Step 1: Write the failing test**

Add a playback expectation covering delayed jump feel:

```ts
it('uses newest motion state while smoothing opponent position', () => {
  expect(/* sampled pose/gravity */).toBe(/* newest packet values */);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --dir /Users/pratik/development/mobile/my-expo-app/server test -- opponentPlayback`
Expected: FAIL because motion state currently follows the sampled packet instead of the newest packet.

**Step 3: Write minimal implementation**

In `useOpponentPlayback`:
- reduce interpolation delay
- continue interpolating `worldX`, `normalizedY`, and velocities
- apply `pose`, `gravityDir`, `frameIndex`, `flipLocked`, and `countdownLocked` from the newest packet immediately

**Step 4: Run test to verify it passes**

Run: `pnpm --dir /Users/pratik/development/mobile/my-expo-app/server test -- opponentPlayback`
Expected: PASS

**Step 5: Commit**

```bash
git add /Users/pratik/development/mobile/my-expo-app/components/game/useOpponentPlayback.ts /Users/pratik/development/mobile/my-expo-app/server/src/tests/opponentPlayback.test.ts
git commit -m "fix: reduce remote movement playback lag"
```

### Task 4: Verify real multiplayer regressions are covered

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/tests/opponentPlayback.test.ts`

**Step 1: Write the missing regression tests**

Add tests for:
- stale packet rejection by sequence
- first running packet authority
- same-origin start alignment expectation
- capped extrapolation still works after the change

**Step 2: Run targeted tests**

Run: `pnpm --dir /Users/pratik/development/mobile/my-expo-app/server test -- opponentPlayback multiplayerRuntime multiplayerGuards physics`
Expected: PASS

**Step 3: Run lint on touched app files**

Run: `pnpm exec eslint /Users/pratik/development/mobile/my-expo-app/services/multiplayer/matchController.ts /Users/pratik/development/mobile/my-expo-app/components/game/useOpponentPlayback.ts`
Expected: PASS

**Step 4: Manual verification**

Run the app on simulator/emulator and verify:
- both players start at the same world point
- remote jumps/flips feel tighter than before
- no crash on entering solo or multiplayer game view

**Step 5: Commit**

```bash
git add /Users/pratik/development/mobile/my-expo-app/server/src/tests/opponentPlayback.test.ts
git commit -m "test: cover multiplayer start sync regressions"
```
