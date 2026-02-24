---
status: pending
priority: p2
issue_id: "016"
tags: [code-review, dead-code]
dependencies: []
---

# Remove or stop exporting getVisiblePlatforms

## Problem Statement

`getVisiblePlatforms` is exported from `utils/levelGeneratorSections.ts` but never imported. Only `generateLevelChunks` and `preGenerateLevelChunks` are used.

## Findings

- **levelGeneratorSections.ts** (249–260): Function exported.
- No usages in codebase.

## Proposed Solutions

### Option 1: Remove function

**Approach:** Delete the function if not needed.

**Pros:** Less dead code.  
**Cons:** None.  
**Effort:** Trivial. **Risk:** None.

### Option 2: Keep but don't export

**Approach:** Remove from export list; keep for internal or future use.

**Pros:** Smaller public API.  
**Cons:** Still dead if not used internally.  
**Effort:** Trivial. **Risk:** None.

## Recommended Action

*To be filled during triage.*

## Technical Details

- **Affected files:** `utils/levelGeneratorSections.ts` (249–260)

## Acceptance Criteria

- [ ] getVisiblePlatforms not exported or removed

## Work Log

### 2025-02-24 - Code review

**By:** Claude Code

**Actions:** code-simplicity-reviewer.
