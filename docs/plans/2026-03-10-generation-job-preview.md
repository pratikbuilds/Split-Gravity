# Generation Job Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Recent Jobs show generated runners with a tighter idle portrait crop while preserving existing preview behavior everywhere else.

**Architecture:** Add a narrow `previewMode` prop to `CharacterSpritePreview` and branch only the transform math for a `jobCard` mode. Then update `GenerationJobCard` to opt into that mode for generated thumbnails so the crop remains isolated to Recent Jobs.

**Tech Stack:** Expo, React Native, Skia, TypeScript

---

### Task 1: Document the approved preview behavior

**Files:**

- Create: `/Users/pratik/development/mobile/my-expo-app/docs/plans/2026-03-10-generation-job-preview-design.md`
- Create: `/Users/pratik/development/mobile/my-expo-app/docs/plans/2026-03-10-generation-job-preview.md`

**Step 1:** Save the approved design note for a Recent Jobs-only preview crop.

**Step 2:** Save the implementation plan for the localized preview refactor.

### Task 2: Extend the shared preview component

**Files:**

- Modify: `/Users/pratik/development/mobile/my-expo-app/components/character/CharacterSpritePreview.tsx`

**Step 1:** Add a `previewMode` prop with a default that preserves current behavior.

**Step 2:** Update the Skia transform math so `jobCard` mode applies a tighter zoom and upward framing.

**Step 3:** Keep the existing idle frame extraction and animation logic unchanged.

### Task 3: Wire Recent Jobs into the new mode

**Files:**

- Modify: `/Users/pratik/development/mobile/my-expo-app/components/character-generation/GenerationJobCard.tsx`

**Step 1:** Pass the new `jobCard` mode only from the Recent Jobs card preview.

**Step 2:** Keep the card layout and button behavior unchanged.

### Task 4: Verify the refactor

**Files:**

- Modify: `/Users/pratik/development/mobile/my-expo-app/components/character/CharacterSpritePreview.tsx`
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/character-generation/GenerationJobCard.tsx`

**Step 1:** Run targeted formatting and lint checks on the touched files.

**Step 2:** Review the diff to make sure no other preview surface picks up the new framing.
