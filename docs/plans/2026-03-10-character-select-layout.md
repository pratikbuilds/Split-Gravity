# Character Select Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the character selection screen so the selected runner preview stays visible while the runner list gains enough space to show multiple cards and the AI Runner Lab becomes a compact highlighted promo.

**Architecture:** Keep the current screen state and confirmation flow intact, but restructure `CharacterSelectScreen` into a smaller hero, a compact lab card, and one shared runner-card feed for built-in and AI-generated characters. The data model stays local to the screen by mapping both source types into a single render list.

**Tech Stack:** Expo, React Native, NativeWind classes, `@expo/vector-icons`, TypeScript

---

### Task 1: Document the approved redesign

**Files:**

- Create: `/Users/pratik/development/mobile/my-expo-app/docs/plans/2026-03-10-character-select-layout-design.md`
- Create: `/Users/pratik/development/mobile/my-expo-app/docs/plans/2026-03-10-character-select-layout.md`

**Step 1:** Save the approved layout design note with the compact hero, highlighted lab card, and unified runner feed.

**Step 2:** Save the implementation plan so the screen refactor has a stable execution record.

### Task 2: Restructure the character selection layout

**Files:**

- Modify: `/Users/pratik/development/mobile/my-expo-app/components/CharacterSelectScreen.tsx`

**Step 1:** Reduce the hero preview footprint while preserving the selected runner preview and title.

**Step 2:** Replace the current `Open AI Runner Lab` button with a compact promo card that includes iconography and stronger visual emphasis.

**Step 3:** Remove the separate `My AI Characters` boxed section and render one vertical feed for all runners.

**Step 4:** Add a shared runner-card renderer that supports built-in and AI-generated entries with the same structure, including an `AI` badge for generated runners.

**Step 5:** Keep the current selection and save behavior unchanged for both preset and custom runners.

### Task 3: Verify behavior

**Files:**

- Modify: `/Users/pratik/development/mobile/my-expo-app/components/CharacterSelectScreen.tsx`

**Step 1:** Run a targeted TypeScript or Expo validation command if available for this workspace.

**Step 2:** Check that the refactor does not break imports or the existing `onConfirm` flow.

**Step 3:** Review the final diff for visual hierarchy regressions or unnecessary complexity.
