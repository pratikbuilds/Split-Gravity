# Startup Render Sync Design

**Date:** 2026-03-06

**Problem**

The previous fix synchronized world and character rendering inside `GameCanvas`, but it left a visible empty fallback frame when the app navigated to the game screen before the startup assets had finished warming. The user now wants the transition itself to avoid that blank blue screen.

**Goal**

Make the first visible gameplay frame atomic without showing an empty interim screen: the app should warm the required startup art before switching into gameplay, then show background, terrain, local player sprite, opponent sprite path, and `3-2-1` countdown together.

**Chosen Approach**

Preload the startup asset set from `App.tsx` while the user is still on the home or lobby screen, then keep the `GameCanvas` readiness gate as a safety net. The flow becomes:

1. Start warming startup assets on app mount.
2. Await that preload before moving from home or lobby into the game screen.
3. Keep `GameCanvas` gated so world rendering and countdown still only begin after Skia confirms the first-frame assets are ready.

This removes the visible blue fallback while preserving the synchronized first gameplay frame.

**Implementation Notes**

- Move the startup asset module IDs into a shared source so both `App.tsx` and `useWorldPictures` refer to the same asset set.
- Preload the startup asset set from `App.tsx` using Expo asset loading.
- Await the preload before switching into the `game` screen for single-player and multiplayer starts.
- Keep the existing `worldAssetsReady` gate in `GameCanvas` so the first Skia draw still waits for the resolved background picture, initial platforms picture, and character sprite sheet.

**Risks**

- If preload is not shared, `App.tsx` and `GameCanvas` could diverge and warm different asset sets.
- If the screen-transition handlers do not await preload consistently, single-player and multiplayer could behave differently.
- `GameCanvas` still needs the local readiness gate because Skia image readiness can lag behind JS-side asset warming.

**Validation**

- Launch the app and tap single-player immediately.
- Confirm the home screen remains visible until gameplay is ready, with no blue blank transition.
- Confirm the first visible game frame contains the world, the player sprite, and the `3-2-1` overlay together.
- Confirm restart and multiplayer startup still behave correctly.
