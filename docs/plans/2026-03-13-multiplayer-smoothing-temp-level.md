# Multiplayer Smoothing Temp Level Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce opponent flicker during multiplayer testing and temporarily remove holes from the generated path while keeping the rest of the section geometry visible.

**Architecture:** Keep the server protocol unchanged and adjust only the client render path so the remote player visually follows the latest snapshot instead of re-running a second local physics simulation. Add a temporary generator flag that overlays continuous floor and ceiling strips onto each section chunk, preserving the section platforms and pillars while eliminating pits for long multiplayer test runs.

**Tech Stack:** React Native, Expo, Reanimated, Skia, TypeScript

---

### Task 1: Smooth remote opponent rendering

**Files:**
- Modify: `components/GameCanvas.tsx`

**Step 1: Write the failing test**

No automated test currently covers the Skia/Reanimated opponent interpolation path. Validate through focused manual inspection instead.

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc --noEmit`
Expected: Existing code compiles before and after the change; behavior issue is visual flicker in multiplayer.

**Step 3: Write minimal implementation**

Update the opponent frame callback to:
- lerp toward `opponentTargetY` each frame
- snap only when the correction distance is abnormally large
- preserve the offscreen death cleanup path

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add components/GameCanvas.tsx
git commit -m "fix: smooth multiplayer opponent rendering"
```

### Task 2: Add temporary no-hole multiplayer corridor mode

**Files:**
- Modify: `types/game.ts`
- Modify: `components/game/useScoreAndChunks.ts`
- Modify: `utils/levelGeneratorSections.ts`

**Step 1: Write the failing test**

No existing generator tests cover a temporary continuous-corridor variant. Validate with typecheck and runtime playtest.

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc --noEmit`
Expected: Existing code compiles before and after the change; behavior issue is hole-filled sections during multiplayer testing.

**Step 3: Write minimal implementation**

Add `forceContinuousCorridor` to the level generator config, pass it from `useScoreAndChunks`, and when enabled add continuous top and bottom segment platforms for each section chunk while leaving existing section platforms intact.

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add types/game.ts components/game/useScoreAndChunks.ts utils/levelGeneratorSections.ts
git commit -m "chore: add temporary no-hole multiplayer corridor"
```
