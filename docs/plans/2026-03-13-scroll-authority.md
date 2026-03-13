# Scroll Authority Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split authoritative race progress from camera scroll so blocked players can fall behind and lose without changing world progression in single-player or multiplayer.

**Architecture:** Introduce separate SharedValues for authoritative progress and visual camera offset, then update simulation, rendering, chunk generation, and multiplayer state emission to depend on the correct one. Add a left-edge death condition based on the player's camera-relative position so falling behind becomes a deterministic loss condition instead of a source of scroll corruption.

**Tech Stack:** Expo, React Native, Reanimated, Skia, TypeScript, Socket.IO

---

### Task 1: Extend simulation state for authority vs camera

**Files:**
- Modify: `components/game/types.ts`
- Modify: `components/game/useScoreAndChunks.ts`

**Step 1: Write the failing test**

No automated test currently covers the Reanimated SharedValue graph for simulation refs. Validate with targeted type/lint checks and manual gameplay verification.

**Step 2: Run test to verify it fails**

Run: `pnpm exec eslint components/game/types.ts components/game/useScoreAndChunks.ts`
Expected: PASS before refactor; behavior issue is architectural rather than a syntax failure.

**Step 3: Write minimal implementation**

Add new refs such as `raceProgress` and `cameraScroll`, initialize them on restart, and move score/chunk logic in `useScoreAndChunks` to read authoritative progress instead of the visual scroll offset.

**Step 4: Run test to verify it passes**

Run: `pnpm exec eslint components/game/types.ts components/game/useScoreAndChunks.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add components/game/types.ts components/game/useScoreAndChunks.ts
git commit -m "refactor: split authority from camera scroll state"
```

### Task 2: Refactor gameplay simulation to keep progress monotonic

**Files:**
- Modify: `components/game/useGameSimulation.ts`
- Modify: `components/game/useGameGestures.ts`

**Step 1: Write the failing test**

Document a manual repro: block the runner on geometry and observe that the world scroll currently rewinds or stalls with the player.

**Step 2: Run test to verify it fails**

Run: `pnpm exec eslint components/game/useGameSimulation.ts components/game/useGameGestures.ts`
Expected: PASS before refactor; gameplay still exhibits the blocked-player scroll bug.

**Step 3: Write minimal implementation**

Change simulation so:
- `raceProgress` always advances while alive and unlocked
- side collisions clamp the runner's local/camera-relative position instead of mutating authority
- flip arc logic updates local runner positioning without corrupting authoritative progress
- emitted multiplayer payloads use `raceProgress`

**Step 4: Run test to verify it passes**

Run: `pnpm exec eslint components/game/useGameSimulation.ts components/game/useGameGestures.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add components/game/useGameSimulation.ts components/game/useGameGestures.ts
git commit -m "refactor: keep forward progress independent from blockage"
```

### Task 3: Add left-edge loss condition

**Files:**
- Modify: `components/game/useGameSimulation.ts`
- Modify: `components/game/constants.ts`

**Step 1: Write the failing test**

Document a manual repro: let the runner fall behind the visible window and confirm the current game does not end on left-edge loss.

**Step 2: Run test to verify it fails**

Run: `pnpm exec eslint components/game/useGameSimulation.ts components/game/constants.ts`
Expected: PASS before refactor; gameplay still allows invalid behind-camera survival.

**Step 3: Write minimal implementation**

Add a left-edge kill margin constant and trigger the same death/reporting path when the runner's right edge moves beyond that threshold behind the camera.

**Step 4: Run test to verify it passes**

Run: `pnpm exec eslint components/game/useGameSimulation.ts components/game/constants.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add components/game/useGameSimulation.ts components/game/constants.ts
git commit -m "feat: end run when player falls behind the camera"
```

### Task 4: Rewire rendering to use camera scroll

**Files:**
- Modify: `components/game/useWorldPictures.ts`
- Modify: `components/GameCanvas.tsx`

**Step 1: Write the failing test**

Document a manual repro: after the authority split, verify that backgrounds, platforms, and player/opponent placement still render against the visual camera rather than authoritative progress directly.

**Step 2: Run test to verify it fails**

Run: `pnpm exec eslint components/game/useWorldPictures.ts components/GameCanvas.tsx`
Expected: PASS before refactor; render path still depends on the old shared scroll assumption.

**Step 3: Write minimal implementation**

Update platform/background transforms and any player-relative coordinate assumptions to read `cameraScroll`, while keeping score and opponent state based on authoritative progress. Preserve the temporary continuous corridor multiplayer test behavior.

**Step 4: Run test to verify it passes**

Run: `pnpm exec eslint components/game/useWorldPictures.ts components/GameCanvas.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/game/useWorldPictures.ts components/GameCanvas.tsx
git commit -m "refactor: render world from camera scroll"
```

### Task 5: Verify multiplayer semantics and long-run behavior

**Files:**
- Modify: `services/multiplayer/matchController.ts` (only if contract assumptions need tightening)

**Step 1: Write the failing test**

Create a manual verification checklist:
- one blocked player should not change the other player's world progression
- a player left behind the window should lose and the opponent should win
- score/chunk generation should continue from authoritative progress

**Step 2: Run test to verify it fails**

Run: `pnpm exec eslint services/multiplayer/matchController.ts components/GameCanvas.tsx components/game/useGameSimulation.ts components/game/useWorldPictures.ts components/game/useScoreAndChunks.ts`
Expected: PASS before refactor; manual multiplayer behavior still exposes the authority coupling bug.

**Step 3: Write minimal implementation**

Tighten any controller assumptions so remote `scroll` is treated purely as authoritative progress and not as a visual camera override. Keep the opponent smoothing changes compatible with the new local authority split.

**Step 4: Run test to verify it passes**

Run: `pnpm exec eslint services/multiplayer/matchController.ts components/GameCanvas.tsx components/game/useGameSimulation.ts components/game/useWorldPictures.ts components/game/useScoreAndChunks.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/multiplayer/matchController.ts components/GameCanvas.tsx components/game/useGameSimulation.ts components/game/useWorldPictures.ts components/game/useScoreAndChunks.ts
git commit -m "fix: stabilize multiplayer world progression"
```
