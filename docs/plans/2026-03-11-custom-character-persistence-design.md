# Custom Character Persistence Design

**Date:** 2026-03-11

**Scope:** Persist generated custom character assets in Railway bucket storage, return a player's saved custom characters reliably in the selector, and prevent other wallets from activating or sending custom character versions they do not own.

## Problem

- Generated custom character assets currently disappear after server restarts/deploys when the backend falls back to local disk storage.
- `/custom-characters` does not deterministically resolve the latest version per character, so older generated characters can be missing or stale in the character select UI.
- Multiplayer and activation flows trust raw custom character identifiers too loosely.

## Recommended Approach

- Keep the existing client gallery flow and fix the backend as the source of truth.
- Use the existing S3-compatible storage adapter with Railway bucket credentials so generated sheets, thumbnails, and animation metadata persist outside the app server filesystem.
- Change custom-character listing and activation to always validate wallet ownership and to resolve the latest version deterministically.
- Validate custom character version usage server-side before a player can activate or send a custom version into multiplayer.

## Data Flow

1. Character generation job finishes.
2. Generated assets are written to the configured Railway bucket.
3. A `custom_characters` row and a `custom_character_versions` row are stored in Postgres.
4. The selector calls `/custom-characters`.
5. The backend returns only the requesting player's non-archived characters, each paired with its latest version and asset URLs.
6. Activation or multiplayer usage of a custom version is allowed only if that version belongs to the authenticated player.

## UI Behavior

- Saved generated characters continue to appear only in `CharacterSelectScreen`.
- `CharacterGenerationScreen` remains focused on generation jobs and immediate post-generation selection.

## Risks

- Bucket credentials must be set correctly in Railway or storage will still fall back to local disk.
- Existing locally stored assets from older deployments cannot be recovered automatically unless they were already uploaded to persistent storage.
