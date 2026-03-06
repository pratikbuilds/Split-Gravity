# Startup Render Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the app enters gameplay only after startup assets are warmed, so the first visible game frame shows the world and character together with no blue blank transition.

**Architecture:** Share the startup asset module list between `App.tsx` and `useWorldPictures`, preload that asset set from `App.tsx` before switching screens, and keep the `GameCanvas` readiness gate as a final first-frame safety check. This removes the visible blank transition without reintroducing the out-of-sync player/world render.

**Tech Stack:** Expo, React Native, React hooks, React Native Reanimated, React Native Skia

---

### Task 1: Centralize startup asset sources

**Files:**
- Create: `components/game/worldAssetSources.ts`
- Modify: `components/game/useWorldPictures.ts`

**Step 1: Add the failing expectation**

Move the startup asset module IDs out of inline `require(...)` calls so both preloading and runtime rendering can use the same source list.

**Step 2: Implement the minimal change**

- Export:
  - terrain tile assets
  - middle platform tile assets
  - countdown digit image assets
  - a flattened startup asset array for preloading
- Update `useWorldPictures` to consume the shared asset definitions.

**Step 3: Sanity-check the hook contract**

Run: `pnpm exec tsc --noEmit`
Expected: TypeScript passes with the shared asset module definitions.

### Task 2: Preload startup assets before entering gameplay

**Files:**
- Modify: `App.tsx`

**Step 1: Add the failing expectation**

Add a preload path in `App.tsx` that can be awaited from single-player and multiplayer game entry.

**Step 2: Implement the minimal change**

- Start preloading on app mount.
- Reuse the same promise for repeated calls.
- Await preload before `setScreen('game')` for single-player and multiplayer match start.
- Fall back gracefully if preload throws so gameplay still remains reachable.

**Step 3: Sanity-check startup behavior**

Run: `pnpm exec tsc --noEmit`
Expected: TypeScript passes with the preload flow and async handlers.

### Task 3: Keep the in-canvas first-frame gate as a safety net

**Files:**
- Modify: `components/GameCanvas.tsx`

**Step 1: Add the failing expectation**

Retain the existing `worldAssetsReady` gate so the visible world and countdown still wait for Skia readiness.

**Step 2: Implement the minimal change**

- Keep world rendering gated behind `worldAssetsReady`.
- Keep the countdown effect keyed on `worldAssetsReady`.
- Do not add a separate placeholder or splash screen.

**Step 3: Verify no stale interval survives**

Run: `pnpm exec tsc --noEmit`
Expected: TypeScript passes and the countdown cleanup remains intact.

### Task 4: Verify the regression path

**Files:**
- Modify: none

**Step 1: Run targeted type verification**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 2: Manual runtime verification**

- Launch the game.
- Start single-player from home.
- Confirm there is no blue blank screen between the tap and gameplay.
- Confirm the first visible frame shows both the world and the player, with the countdown overlaid.
- Restart once and confirm the same behavior repeats.

**Step 3: Commit**

```bash
git add App.tsx components/GameCanvas.tsx components/game/useWorldPictures.ts components/game/worldAssetSources.ts docs/plans/2026-03-06-startup-render-sync-design.md docs/plans/2026-03-06-startup-render-sync.md
git commit -m "fix: preload startup game assets"
```
