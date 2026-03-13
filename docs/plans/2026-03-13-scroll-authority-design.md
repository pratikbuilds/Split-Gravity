# Scroll Authority Refactor Design

## Goal

Decouple forward race progress from the player's local collision state so the world always advances consistently in both single-player and multiplayer. A player who cannot keep up with the advancing world should lose by falling behind the left edge, rather than stalling or rewinding world progression.

## Problem

The current simulation uses `totalScroll` for multiple responsibilities at once:

- authoritative race progress
- score
- chunk spawning and trimming
- background/platform rendering offset
- player collision world position
- multiplayer state sync

That coupling creates a structural bug. In `components/game/useGameSimulation.ts`, forward movement increments `totalScroll`, but side-collision handling can later clamp it backward when the runner is blocked by geometry. That means local blockage mutates the same value used as world authority. In multiplayer, one player's stuck state can produce a different effective world progression than the other player's, which makes visual sync unstable and hard to reason about.

## Desired Behavior

- Forward progress advances continuously while the run is active.
- Collision with geometry can affect the runner's local on-screen position, but not authoritative world progress.
- Chunk spawning, score, and multiplayer packets are derived from authoritative progress only.
- Rendering uses a camera offset that is allowed to differ from authoritative progress.
- If the runner falls behind the left edge of the visible play area, the run ends.
- In multiplayer, falling behind the left edge counts as a normal local loss and the opponent wins if still alive.

## Recommended Approach

Introduce two separate SharedValues:

- `raceProgress`: authoritative forward progress for simulation, scoring, chunk generation, and multiplayer sync
- `cameraScroll`: visual scroll offset for background/platform rendering and player screen placement

The player's collision position should be computed from world coordinates derived from these two values, but collision resolution must not mutate `raceProgress`.

## Alternatives Considered

### 1. Clamp-only patch

Keep one scroll value and only stop side collisions from decreasing it.

Why not:
- still mixes camera state with authority
- likely leaves more hidden bugs in score/chunk sync
- makes future multiplayer reasoning harder

### 2. Time-derived progress only

Compute progress from elapsed runtime instead of storing it.

Why not:
- cleaner on paper, but more invasive right now
- touches countdown, death handling, replay behavior, and frame subdivision logic at once

### 3. Server-authoritative race clock

Move progress authority to the server for multiplayer.

Why not right now:
- correct long-term direction for competitive play
- too large for the current bug-fix scope
- still worth considering later after the client-side authority split

## Detailed Design

### 1. Simulation authority split

Add `raceProgress` and `cameraScroll` to `SimulationRefs`.

Rules:
- `raceProgress` increases every simulation step while the player is alive and gameplay is active.
- `cameraScroll` tracks what is rendered on screen.
- `cameraScroll` should never be the source of truth for scoring or multiplayer packets.

### 2. Player positioning model

The runner should have a stable screen anchor under normal play, but when blocked they should be allowed to drift left relative to the camera instead of dragging the world backward.

Practically:
- keep a screen-space player position or derive it from `raceProgress - cameraScroll`
- use world coordinates for platform collisions
- if side collision occurs, clamp the runner's local position, not the authoritative progress

### 3. Loss condition for falling behind

Add a left-edge failure rule:
- if the player's on-screen right edge moves behind a configurable left kill margin, mark them as dead

This should use the same death/reporting path as vertical death so multiplayer result handling remains consistent.

### 4. Rendering and chunk management

Rendering:
- background/platform transforms should use `cameraScroll`
- player and opponent rendering should use screen-space positions derived from camera-relative coordinates

Chunk management:
- chunk generation and trimming should use `raceProgress`
- score display should use `raceProgress`

### 5. Multiplayer contract usage

The existing packet already includes `scroll`. After this refactor, that field should represent authoritative forward progress only.

That means:
- local player sends `raceProgress`
- remote player rendering uses opponent `scroll` only as race progress, not as a camera override
- one player being blocked cannot change the other's world progression

## Files Expected To Change

- `components/game/types.ts`
- `components/game/useGameSimulation.ts`
- `components/game/useScoreAndChunks.ts`
- `components/game/useGameGestures.ts`
- `components/game/useWorldPictures.ts`
- `components/GameCanvas.tsx`
- `types/game.ts`
- possibly `services/multiplayer/matchController.ts` if assumptions around remote scroll handling need tightening

## Risks

- Existing collision math assumes `totalScroll` is both authority and camera; changing this may surface hidden dependencies.
- The initial no-hole multiplayer corridor patch should continue to work after the authority split.
- Left-edge death can feel too aggressive if the kill margin is too close to the screen edge.

## Testing Strategy

Manual testing:
- single-player: run into geometry and verify the world still advances
- single-player: verify the player dies after falling behind the left edge
- multiplayer: verify one stuck player does not alter the other player's apparent world progression
- multiplayer: verify falling behind reports a normal loss and ends the match correctly
- long-run: verify chunk spawning and trimming continue working without holes or visual popping

Targeted validation:
- lint/typecheck touched files
- inspect outbound multiplayer packets to confirm `scroll` still increases monotonically during active play

## Success Criteria

- `raceProgress` never decreases during active play
- local collisions never rewind world authority
- score and chunk generation continue even if the player is blocked
- falling behind the left edge ends the run
- multiplayer views remain consistent when one player gets stuck or left behind
