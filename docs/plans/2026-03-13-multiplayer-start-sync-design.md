# Multiplayer Start Sync Design

**Problem**

Multiplayer currently has two visible defects:
- the remote player can begin the run from a different world start point than the local player
- remote flips and movement feel delayed because playback waits too long before showing new state

The root causes are:
- `MultiplayerMatchController` seeds a synthetic opponent baseline before live packets arrive
- `useOpponentPlayback` applies a fixed interpolation delay and treats the first running state like any later packet

**Decision**

Use an authority-first start alignment model:
- both players share the same canonical starting `worldX`
- countdown baselines may differ by lane, but not by world position
- the first live `running` opponent packet becomes the alignment point for the remote player

After alignment, opponent playback stays buffered, but with a smaller delay and immediate non-positional state updates.

## Approach Options

### Option 1: Authoritative start snap plus lighter playback buffer

Use the first running packet as the remote player's authoritative live start position. Reduce interpolation delay and keep only positional smoothing.

Pros:
- smallest code change
- directly fixes both observed issues
- preserves the current protocol and transport

Cons:
- still depends on packet cadence quality

### Option 2: Fully authoritative remote rendering

Render the opponent only from live network state and avoid any local countdown baseline beyond a neutral placeholder.

Pros:
- cleanest authority model

Cons:
- more visible waiting period if the first packet is late
- larger behavior change than needed

### Option 3: Heavier prediction and extrapolation

Keep the current baseline approach and attempt to hide mismatch with more prediction.

Pros:
- can feel responsive when networking is ideal

Cons:
- increases divergence risk
- makes startup mismatch harder to reason about

**Chosen option:** Option 1.

## Design

### Start Alignment

`buildBaselineOpponentSnapshot` should no longer carry a previous remote `worldX` into a new run. Countdown and running baselines should seed the opponent at the canonical run origin (`worldX = 0`) and keep lane assignment as the only pre-run visual difference.

When the first live `match:opponentState` packet arrives with `phase === 'running'` and `countdownLocked === 0`, playback should treat it as the start anchor. If the remote player is still on synthetic baseline state, that first live packet should snap the remote player to the authoritative `worldX` instead of blending from the synthetic value.

### Playback Smoothing

`useOpponentPlayback` should reduce the interpolation delay from the current 75ms to a smaller buffer so jumps and flips do not trail the actual packet stream by a visible extra beat. Position should still interpolate between packets and extrapolate briefly when packets are late.

Pose, gravity direction, frame index, flip lock, and countdown lock should update from the newest packet immediately instead of inheriting delayed values from whichever positional sample was chosen. This keeps motion state responsive without giving up smooth position.

### Failure Handling

- keep dropping stale or out-of-order packets by `seq`
- keep capped extrapolation for short gaps
- snap only for initial live alignment or clearly synthetic-to-live transitions
- continue to sanitize invalid numeric values before writing to shared values

## Files Expected To Change

- `services/multiplayer/matchController.ts`
- `components/game/useOpponentPlayback.ts`
- optionally tests around `shared/opponentPlayback.ts` or a new targeted playback test

## Success Criteria

- both clients see the opponent start from the same world origin
- top/bottom lane difference remains intact
- remote flips and movement look materially less delayed
- no new startup crash or renderer regression
