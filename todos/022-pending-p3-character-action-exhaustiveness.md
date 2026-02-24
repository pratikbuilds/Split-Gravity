---
status: pending
priority: p3
issue_id: "022"
tags: [code-review, typescript]
dependencies: []
---

# CharacterAction exhaustiveness in characterSpritePresets

## Problem Statement

frameSlowdowns and actions are Record<CharacterAction, ...>. If a new action is added to the union, TypeScript will error only where those records are created. Consider satisfies Record<CharacterAction, ...> or helper so adding an action forces updates in one place.

## Findings

- **characterSpritePresets.ts:** frameSlowdowns and actions keyed by CharacterAction; no exhaustiveness check.

## Proposed Solutions

### Option 1: satisfies or helper

**Approach:** Use `satisfies Record<CharacterAction, ...>` when defining presets, or a small helper that requires all keys, so new actions force preset updates.

**Pros:** Compiler enforces completeness.  
**Cons:** Slight refactor.  
**Effort:** Small. **Risk:** Low.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `components/game/characterSpritePresets.ts`

## Acceptance Criteria

- [ ] Adding a new CharacterAction forces preset updates (type or build error)

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** kieran-typescript-reviewer.
