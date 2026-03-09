# Post-Payment Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated post-payment success flow that gives paid single-player and paid multiplayer clear next steps, and make paid single-player refundable until the user explicitly starts the run.

**Architecture:** Stop routing directly from payment confirmation into gameplay or lobby. Persist the funded payment session, route into a dedicated post-payment handoff screen, and only create the single-player contest entry when the user taps `Start Run`. Add an authenticated backend refund endpoint so pre-start single-player payments can be cancelled cleanly.

**Tech Stack:** Expo React Native, TypeScript, NativeWind, existing backend payment service/routes, Socket.IO multiplayer

---

### Task 1: Model the post-payment handoff state

**Files:**
- Modify: `types/payments.ts`
- Modify: `App.tsx`

**Step 1: Add route and handoff types**

Add a new `HomeScreenRoute` entry for the post-payment handoff screen plus a typed payload describing:
- `kind`: `single_paid_contest` | `multi_paid_private` | `multi_paid_queue`
- `title`, `subtitle`, `primaryActionLabel`
- payment/token/tier/contest summary fields
- whether refund is allowed

**Step 2: Add app state for the handoff payload**

Store the payload in `App.tsx` next to `pendingPaidSession`.

**Step 3: Stop auto-routing after payment**

Change `handlePaidSetupComplete` so it:
- stores `pendingPaidSession`
- stores the handoff payload
- navigates to the new post-payment route

**Step 4: Keep existing reset paths coherent**

When returning home or abandoning the flow, clear both:
- `pendingPaidSession`
- post-payment handoff payload

### Task 2: Build the post-payment success screen

**Files:**
- Create: `components/PostPaymentSuccessScreen.tsx`
- Modify: `App.tsx`

**Step 1: Create the component**

Build a dedicated success screen with:
- premium confirmation headline
- entry fee / token summary
- contextual multiplayer vs single-player copy
- one dominant CTA
- secondary refund action when allowed
- secondary back-home action

**Step 2: Keep mode-specific copy explicit**

Single-player copy should feel like a launch pad into the run.

Multiplayer copy should emphasize that funds are secured and the next step is lobby or queue coordination.

**Step 3: Wire the route**

Render the new component from `App.tsx` when the new post-payment route is active.

### Task 3: Move single-player contest entry creation to Start Run

**Files:**
- Modify: `components/PaidModeSetupScreen.tsx`
- Modify: `App.tsx`

**Step 1: Change paid setup completion payload**

`PaidModeSetupScreen` should stop creating the contest entry/run session for `single_paid_contest`.

It should return only:
- auth token
- payment intent id
- transaction signature
- token/tier/contest selection

**Step 2: Create a start-run action in App.tsx**

Add a handler that:
- verifies `pendingPaidSession` exists
- creates the contest entry via `backendApi.createContestEntry(...)`
- updates `pendingPaidSession` with `contestEntryId` and `runSessionId`
- preloads assets/audio
- sets single-player paid mode
- enters `game`

**Step 3: Keep retries safe**

If contest-entry creation fails:
- keep the user on the success screen
- show a clear error
- do not lose the funded session

### Task 4: Add authenticated pre-start refund support

**Files:**
- Modify: `services/backend/api.ts`
- Modify: `shared/payment-contracts.ts`
- Modify: `server/src/payments/routes.ts`
- Modify: `server/src/payments/service.ts`
- Modify: `server/src/payments/store.ts`
- Test: `server/src/tests/paymentService.test.ts`

**Step 1: Add the client contract**

Define:
- `RefundPaymentIntentResponse`
- client API helper for `POST /payments/intents/:paymentIntentId/refund`

**Step 2: Add service-level refund logic**

Create an authenticated refund method that:
- resolves the session from `accessToken`
- validates the payment intent belongs to the player
- only allows refund while the intent is still pre-start for its mode
- rejects if a single-player contest entry has already been created

**Step 3: Add route**

Expose the authenticated refund endpoint from `server/src/payments/routes.ts`.

**Step 4: Add store support if needed**

Expose a way to detect whether a contest entry already exists for a payment intent, so single-player refunds cannot happen after `Start Run`.

**Step 5: Test the boundary**

Add or extend tests to verify:
- confirmed single-player intent can be refunded before contest entry exists
- refund is rejected after contest entry exists
- existing realtime refund paths remain intact

### Task 5: Wire refund and primary CTA behavior on the success screen

**Files:**
- Modify: `App.tsx`
- Modify: `components/PostPaymentSuccessScreen.tsx`

**Step 1: Primary CTA routing**

Implement:
- `Start Run` -> contest entry creation -> game
- `Enter Lobby` -> `multiplayerController.resetLobbyState()` -> lobby
- `Join Matchmaking` -> `multiplayerController.resetLobbyState()` -> lobby

**Step 2: Refund CTA**

Implement refund flow that:
- calls the new refund endpoint
- clears paid session/handoff state on success
- routes the user back to the relevant mode selection screen
- shows loading/error state cleanly

**Step 3: Prevent duplicate actions**

Disable CTA/refund buttons while:
- refund is pending
- single-player start-run preparation is pending

### Task 6: Verify end-to-end behavior

**Files:**
- Modify if needed after verification: `App.tsx`, `components/PostPaymentSuccessScreen.tsx`, backend payment files

**Step 1: Run backend payment tests**

Run: `pnpm test --dir server`

Expected:
- payment service tests pass
- refund boundary coverage passes

**Step 2: Run frontend static checks**

Run: `pnpm lint`

Expected:
- no TypeScript/ESLint/Prettier issues introduced by the new flow

**Step 3: Manual UX verification**

Verify on device/emulator:
- paid single-player lands on success screen, not game
- refund is available before `Start Run`
- `Start Run` creates the run and enters the game cleanly
- paid private multiplayer lands on success screen, then lobby
- paid matchmaking lands on success screen, then queue/lobby handoff
- no auto-start hiccups or accidental back-navigation state leaks
