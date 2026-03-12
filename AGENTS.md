# Agent Learnings — my-expo-app

## Project Overview

React Native (Expo) side-scrolling platformer game with Skia Canvas rendering and Reanimated physics. Supports single-player and real-time multiplayer via WebSocket.

## Architecture

### Rendering Stack

- **@shopify/react-native-skia** `<Canvas>` for all game visuals (background, platforms, character)
- **react-native-reanimated** `SharedValue` + `useFrameCallback` for 60fps physics on UI thread
- **react-native-worklets** `scheduleOnRN` to bridge UI thread → JS thread when needed
- Regular React Native `<View>/<Text>` for HUD overlays (score, countdown, exit button)

### Key Files

| File                                      | Role                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `components/GameCanvas.tsx`               | Top-level game component — Canvas, HUD, gestures                      |
| `components/game/useGameSimulation.ts`    | Physics loop via `useFrameCallback` (gravity, collision, death)       |
| `components/game/useScoreAndChunks.ts`    | Chunk spawning + score tracking                                       |
| `components/game/useWorldPictures.ts`     | Skia Picture generation for terrain, background, debug colliders      |
| `components/game/useGameGestures.ts`      | Tap gesture → gravity flip                                            |
| `components/game/constants.ts`            | All physics/rendering tuning constants                                |
| `components/game/types.ts`                | `SimulationRefs`, `GameCanvasProps`, shared interfaces                |
| `utils/levelGeneratorSections.ts`         | Section-based procedural level generation                             |
| `utils/levelSections.ts`                  | Hand-authored level section templates                                 |
| `shared/game/physics.ts`                  | Pure worklet physics functions (collision, grounding, frame stepping) |
| `services/multiplayer/matchController.ts` | WebSocket multiplayer state machine                                   |
| `server/src/index.ts`                     | Game server (matchmaking, state relay)                                |

### State Architecture

- **UI thread (SharedValues via `SimulationRefs`):** All real-time game state — position, velocity, scroll, gravity direction, frame index, platform collider rects
- **JS thread (React state):** Only things that trigger visual structure changes — `chunks` (platform geometry), `countdownDigit`, screen/mode in App.tsx
- **Isolated overlays:** HUD components like `ScoreOverlay` use `React.memo` + own `useAnimatedReaction` subscription so they never cause Canvas re-renders

## Critical Performance Rules

### 1. Never put frequently-changing values in React state inside GameCanvas

**Problem:** Any `useState` inside `GameCanvas` or its hooks causes the entire Skia `<Canvas>` to re-render (reconcile all Pictures, Atlas, Groups). At 60fps game speed, even 5-6 re-renders/sec causes visible flicker/stutter.

**Pattern:** Use `SharedValue` for anything that updates more than ~1x/sec. Display it via an isolated `React.memo` component with its own `useAnimatedReaction` → `scheduleOnRN(setState)`.

**Example (score):**

```typescript
// BAD — causes GameCanvas re-render every update
const [score, setScore] = useState(0);
// in worklet: scheduleOnRN(setScore, newScore);

// GOOD — SharedValue on UI thread, isolated display component
const scoreValue = useSharedValue(0);
// in worklet: scoreValue.value = newScore;  // zero cost
// ScoreOverlay subscribes independently via useAnimatedReaction
```

### 2. useAnimatedReaction preparer determines fire rate

The reaction callback runs every time the preparer return value changes. If preparer returns `totalScroll.value` (changes every frame), the reaction fires 60x/sec. Use bucket math to throttle:

```typescript
// Fires every 300 distance units, not every frame
() => Math.floor(refs.totalScroll.value / 300);
```

### 3. Only `setChunks` should trigger GameCanvas re-renders

Platform geometry changes (~1/sec) are the only legitimate reason for `GameCanvas` to re-render. This triggers `platformsPicture` recreation in `useWorldPictures`, which is necessary and acceptable at that rate.

### 4. scheduleOnRN is expensive — minimize usage

Each `scheduleOnRN` call bridges UI thread → JS thread. Fine for infrequent events (death, game over, chunk spawn). Never use it per-frame for display updates.

## Physics Notes

- `useFrameCallback` runs the physics loop — gravity, velocity integration, collision detection
- `normalizeFrameStep` in `shared/game/physics.ts` subdivides large dt into 16ms substeps (max 4)
- Collision uses flat `number[]` array for platform rects (`[x, y, w, h, x, y, w, h, ...]`) for worklet performance
- Gravity flip locks until landing via `flipLockedUntilLanding` SharedValue
- Death detection uses `DEATH_MARGIN_FRACTION` to avoid false positives near platforms

## Level Generation

- Section-based: hand-authored templates in `levelSections.ts`, assembled by `levelGeneratorSections.ts`
- Chunks have `phase: 'intro' | 'main' | 'recovery'` for difficulty pacing
- `preGenerateLevelChunks` creates initial visible chunks; `generateLevelChunks` adds/removes as player scrolls
- `FLAT_ZONE_LENGTH = 400px` of safe ground at game start

## Multiplayer

- WebSocket via `matchController.ts` — lobby, ready, countdown, state relay
- `onLocalState` sends normalized position to server every 2 frames (when multiplayer)
- Opponent rendered at `OPPONENT_X_FACTOR = 0.34` screen width
- Reconnect/forfeit flow with configurable timeout

## Terrain Themes

Three visual themes: `grass`, `purple`, `stone` — each with top/topLeft/topRight/left/center/right tile variants. Autotile logic in `shared/game/terrainAutotile.ts`. Middle-lane "pillar" platforms use separate tile assets.

## Common Pitfalls

1. **Don't add `useState` to `useScoreAndChunks` for display-only data** — use SharedValue + isolated component
2. **Don't pass unstable callbacks to `useGameSimulation`** — wrap with `useCallback` or use ref pattern (`triggerGameOverRef.current`)
3. **`useWindowDimensions()` can flicker during orientation lock** — the init `useEffect` in `useScoreAndChunks` depends on `width`/`height`, so it may re-run during landscape transition. This is a one-time cost, not a loop.
4. **Platform rects SharedValue must be flat `number[]`** — worklets can't handle object arrays efficiently
5. **`useAnimatedReaction` returning objects:** Reanimated does shallow comparison, so `{ a, b }` objects work for throttling but create the object every frame on the UI thread. Prefer single numeric buckets when possible.
6. **Never alter user sprite backgrounds/transparency** — when replacing sprite sheets, copy files exactly as provided (no background edits or flattening). Verify source format/alpha first; if alpha is missing or background is baked into the asset, confirm with the user before proceeding.

## Learned User Preferences

- When replacing or using user-provided sprite sheets, use the exact file they provided; do not modify images with CLI or other tools.
- For level sections, keep layouts symmetric and fully playable; avoid adding excessive gaps solely to increase difficulty.
- For larger design changes (e.g. level sections redesign), brainstorm and plan before implementing.

## Learned Workspace Facts

- User-supplied character sprite sheets in this project are often 5504×3072; use this as the canonical size when adding or swapping character atlases.
- Pillars in level sections are optional; not every section needs pillars—ledge-only and variable-height-only sections are valid.

eas build --profile preview --platform android
