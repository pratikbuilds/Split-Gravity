# Sprite Animation and Generation Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make generated runners play with a stable idle baseline, a readable arcade sprint run cycle, and stronger prompt-driven generation quality gates.

**Architecture:** Tighten the generation contract in the Gemini pipeline, then add shared generated-frame normalization so preview and gameplay both align sprites to a stable baseline instead of trusting raw grid cells. Keep preset characters on their current path and apply the new normalization only to generated sheets.

**Tech Stack:** Expo, React Native, Skia, TypeScript, Node.js, Gemini image generation pipeline, test runner used by the repo

---

### Task 1: Save the approved design and plan docs

**Files:**
- Create: `/Users/pratik/development/mobile/my-expo-app/docs/plans/2026-03-10-sprite-animation-generation-design.md`
- Create: `/Users/pratik/development/mobile/my-expo-app/docs/plans/2026-03-10-sprite-animation-generation.md`

**Step 1:** Save the approved design note for sprite animation and generation quality.

**Step 2:** Save this implementation plan.

**Step 3:** Commit only the new docs.

Run: `git add docs/plans/2026-03-10-sprite-animation-generation-design.md docs/plans/2026-03-10-sprite-animation-generation.md && git commit -m "docs: add sprite animation generation plan"`

Expected: a commit containing only the two new planning documents.

### Task 2: Isolate generated-sheet normalization helpers

**Files:**
- Create: `/Users/pratik/development/mobile/my-expo-app/components/game/generatedSpriteSheet.ts`
- Test: `/Users/pratik/development/mobile/my-expo-app/components/game/generatedSpriteSheet.test.ts`

**Step 1: Write the failing test**

Cover:
- visible-bounds extraction inside one magenta-backed cell
- shared idle baseline locking across multiple frames
- run baseline locking while preserving width variation

**Step 2: Run test to verify it fails**

Run: `pnpm test -- generatedSpriteSheet`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Add helpers that:
- build 6x3 frame rects from image dimensions
- derive trimmed visible bounds inside each frame
- compute stable action anchors for idle and run rows
- return normalized source rects and anchor metadata

**Step 4: Run test to verify it passes**

Run: `pnpm test -- generatedSpriteSheet`

Expected: PASS for the new helper coverage.

**Step 5: Commit**

Run: `git add components/game/generatedSpriteSheet.ts components/game/generatedSpriteSheet.test.ts && git commit -m "feat: add generated sprite alignment helpers"`

### Task 3: Apply normalization in gameplay rendering

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/game/useWorldPictures.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/game/characterSpritePresets.ts`
- Test: `/Users/pratik/development/mobile/my-expo-app/components/game/generatedSpriteSheet.test.ts`

**Step 1: Write the failing test**

Add or extend coverage proving generated idle frames resolve to the same baseline and that generated run frames stay grounded when frame widths differ.

**Step 2: Run test to verify it fails**

Run: `pnpm test -- generatedSpriteSheet`

Expected: FAIL because `useWorldPictures` still uses raw grid cells for generated sheets.

**Step 3: Write minimal implementation**

- Extend generated preset creation so generated actions can use normalized frame data instead of uniform cells only.
- Update render metric / placement logic to respect normalized anchors for generated sheets.
- Keep preset-character rendering behavior unchanged.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- generatedSpriteSheet`

Expected: PASS with generated gameplay placement using stable alignment.

**Step 5: Commit**

Run: `git add components/game/useWorldPictures.ts components/game/characterSpritePresets.ts components/game/generatedSpriteSheet.ts components/game/generatedSpriteSheet.test.ts && git commit -m "feat: stabilize generated sprite playback"`

### Task 4: Match preview playback to gameplay

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/character/CharacterSpritePreview.tsx`
- Test: `/Users/pratik/development/mobile/my-expo-app/components/game/generatedSpriteSheet.test.ts`

**Step 1: Write the failing test**

Add coverage for preview-facing frame selection or helper output if needed so generated idle previews use the same normalized framing as gameplay.

**Step 2: Run test to verify it fails**

Run: `pnpm test -- generatedSpriteSheet`

Expected: FAIL because preview still crops the raw idle row.

**Step 3: Write minimal implementation**

- Reuse the generated-sheet helper in `CharacterSpritePreview`.
- Keep preset preview behavior unchanged.
- Preserve the existing animation cadence.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- generatedSpriteSheet`

Expected: PASS with preview and gameplay using consistent generated-sheet alignment.

**Step 5: Commit**

Run: `git add components/character/CharacterSpritePreview.tsx components/game/generatedSpriteSheet.ts components/game/generatedSpriteSheet.test.ts && git commit -m "feat: align generated sprite previews"`

### Task 5: Tighten the Gemini prompt and validator

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/modules/character-generation/pipeline/geminiSpritePipeline.ts`
- Test: `/Users/pratik/development/mobile/my-expo-app/server/src/modules/character-generation/pipeline/geminiSpritePipeline.test.ts`

**Step 1: Write the failing test**

Cover:
- prompt includes arcade sprint wording
- prompt includes locked idle baseline wording
- inspection parsing supports new run and idle stability fields
- retry correction text includes specific failures such as arm swing and idle drift

**Step 2: Run test to verify it fails**

Run: `pnpm --dir server test -- geminiSpritePipeline`

Expected: FAIL because the prompt and inspection schema do not include the new contract yet.

**Step 3: Write minimal implementation**

- Expand `GridCheckResult`.
- Update validation prompt and response schema.
- Tighten `buildPrompt`.
- Improve retry correction text and final failure specificity.

**Step 4: Run test to verify it passes**

Run: `pnpm --dir server test -- geminiSpritePipeline`

Expected: PASS with the new contract enforced.

**Step 5: Commit**

Run: `git add server/src/modules/character-generation/pipeline/geminiSpritePipeline.ts server/src/modules/character-generation/pipeline/geminiSpritePipeline.test.ts && git commit -m "feat: tighten sprite generation validation"`

### Task 6: Run targeted verification on the touched surfaces

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/game/useWorldPictures.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/character/CharacterSpritePreview.tsx`
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/modules/character-generation/pipeline/geminiSpritePipeline.ts`

**Step 1:** Run targeted tests for the new helper and pipeline coverage.

Run: `pnpm test -- generatedSpriteSheet`

Expected: PASS

Run: `pnpm --dir server test -- geminiSpritePipeline`

Expected: PASS

**Step 2:** Review the final diff and confirm no unrelated user changes were modified.

Run: `git status --short`

Expected: only the intended files plus any pre-existing unrelated edits.

**Step 3:** Create the final implementation commit after code review.

Run: `git add components/game/generatedSpriteSheet.ts components/game/generatedSpriteSheet.test.ts components/game/useWorldPictures.ts components/game/characterSpritePresets.ts components/character/CharacterSpritePreview.tsx server/src/modules/character-generation/pipeline/geminiSpritePipeline.ts server/src/modules/character-generation/pipeline/geminiSpritePipeline.test.ts && git commit -m "feat: improve generated runner animation quality"`
