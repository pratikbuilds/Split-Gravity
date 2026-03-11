# Custom Character Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make generated custom characters persist in Railway bucket storage, reliably reappear in the character select screen, and only be usable by the wallet that created them.

**Architecture:** Keep the current client flow intact and fix the backend ownership and retrieval logic. The repository becomes responsible for deterministic latest-version resolution, the character generation service validates ownership before activation/multiplayer use, and the multiplayer server sanitizes inbound custom character version IDs against the authenticated wallet player.

**Tech Stack:** Expo/React Native client, Node/Express backend, Socket.IO, Drizzle ORM, Postgres, S3-compatible Railway bucket, Node test runner.

---

### Task 1: Document the persistence and ownership contract

**Files:**
- Modify: `server/.env.example`
- Modify: `server/README.md`

**Step 1: Clarify Railway bucket env requirements**

Document which `CHARACTER_BUCKET_*` values must come from the Railway bucket credentials page and when the app will fall back to local storage.

**Step 2: Clarify ownership behavior**

Document that only the owner wallet can activate or send a custom character version into gameplay, while public version fetch remains available for opponent rendering.

### Task 2: Make gallery retrieval deterministic

**Files:**
- Modify: `server/src/modules/character-generation/repositories/characterGenerationRepository.ts`
- Modify: `server/src/modules/character-generation/service/characterGenerationService.ts`
- Test: `server/src/tests/characterGenerationOwnership.test.ts`

**Step 1: Write a failing test for latest-version selection**

Create a focused test for the selection helper or service-level mapping that proves multiple versions on one character always resolve to the newest version.

**Step 2: Implement deterministic latest-version resolution**

Return each character with its latest version based on `custom_character_versions.created_at` and `id` as a tie-breaker.

**Step 3: Run targeted test**

Run: `pnpm --dir server test -- characterGenerationOwnership.test.ts`

### Task 3: Enforce owner-only activation and version use

**Files:**
- Modify: `server/src/modules/character-generation/repositories/characterGenerationRepository.ts`
- Modify: `server/src/modules/character-generation/service/characterGenerationService.ts`
- Modify: `server/src/multiplayer/server.ts`
- Test: `server/src/tests/characterGenerationOwnership.test.ts`

**Step 1: Write failing ownership tests**

Cover:
- activating a character owned by another player fails
- resolving a custom version for gameplay returns null when the wallet does not own it

**Step 2: Implement repository/service ownership checks**

Add repository methods that resolve versions through the owning player's `custom_characters` rows and expose a service method multiplayer can call.

**Step 3: Sanitize multiplayer payloads**

Before room create/join/queue join accepts `customCharacterVersionId`, validate it against the authenticated wallet player when `characterId === 'custom'`; otherwise drop it.

**Step 4: Run targeted test**

Run: `pnpm --dir server test -- characterGenerationOwnership.test.ts`

### Task 4: Verify end-to-end backend safety

**Files:**
- Modify: `server/README.md`
- Modify: `server/.env.example`

**Step 1: Run server test suite subset**

Run: `pnpm --dir server test -- characterGenerationOwnership.test.ts multiplayerGuards.test.ts`

**Step 2: Run typecheck**

Run: `pnpm --dir server typecheck`

**Step 3: Summarize Railway follow-up**

List the exact env vars that still need to be populated in Railway from the bucket credentials page.
