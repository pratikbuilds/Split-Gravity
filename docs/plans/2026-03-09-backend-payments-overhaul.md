# Backend Payments Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the backend's in-memory payment and multiplayer-critical state with a documented, modular, custodial architecture that persists deposit, payout, and withdrawal transaction signatures.

**Architecture:** Introduce typed env/config, backend documentation, durable payment repositories, Solana chain adapters, and modular HTTP/socket bootstrapping. Implement the refactor in thin slices so the server keeps a clear execution path while the fake ledger and monolithic transport logic are retired.

**Tech Stack:** TypeScript, Express, Socket.IO, Drizzle ORM, PostgreSQL, Solana RPC, custodial vault signer

---

### Task 1: Add Backend Docs And Env Contract

**Files:**
- Create: `server/README.md`
- Create: `server/.env.example`
- Modify: `server/package.json`

**Step 1: Write the failing test**

No automated test. Validation is documentation-driven for this task.

**Step 2: Capture required runtime and development env vars**

Document:
- `PORT`
- `LOG_LEVEL`
- `LOG_STATE_EVENTS`
- `DATABASE_URL`
- `SOLANA_RPC_HTTP`
- `SOLANA_RPC_WS`
- `VAULT_PUBLIC_KEY`
- `VAULT_SECRET_KEY_JSON` or equivalent signer secret source

**Step 3: Write minimal implementation**

- Add `server/README.md` with setup, architecture summary, scripts, env vars, and operational notes.
- Add `server/.env.example` with placeholders and comments.
- Update `server/package.json` scripts only if documentation references missing commands.

**Step 4: Verify**

Run: `test -f server/README.md && test -f server/.env.example`
Expected: exit code `0`

**Step 5: Commit**

```bash
git add server/README.md server/.env.example server/package.json
git commit -m "docs: add backend setup and env contract"
```

### Task 2: Add Typed Env And Shared Backend Dependencies

**Files:**
- Create: `server/src/config/env.ts`
- Create: `server/src/lib/logger.ts`
- Create: `server/src/lib/db.ts`
- Modify: `server/src/index.ts`
- Modify: `server/package.json`

**Step 1: Write the failing test**

Create a small config boot test after the module exists.

**Step 2: Run test to verify it fails**

Run: `pnpm --dir server test`
Expected: FAIL because env/config modules do not exist yet.

**Step 3: Write minimal implementation**

- Add a typed `env.ts` that validates required env vars and exposes parsed config.
- Add a reusable structured logger module.
- Add `db.ts` with runtime Drizzle/Postgres wiring.
- Update `server/src/index.ts` to consume env/logger from shared modules instead of inline constants.
- Add any missing backend dependencies explicitly in `server/package.json`.

**Step 4: Run tests and typecheck**

Run: `pnpm --dir server test`
Expected: PASS for config-related coverage.

Run: `pnpm --dir server exec tsc --noEmit --pretty false`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/config/env.ts server/src/lib/logger.ts server/src/lib/db.ts server/src/index.ts server/package.json
git commit -m "refactor: centralize backend env and shared dependencies"
```

### Task 3: Persist Payment Sessions, Intents, And Chain Signatures

**Files:**
- Modify: `server/src/db/schema.ts`
- Create: `server/src/modules/payments/repositories/*.ts`
- Modify: `server/src/payments/service.ts`
- Modify: `server/src/payments/store.ts`
- Test: `server/src/tests/paymentsAuth.test.ts`
- Create: `server/src/tests/paymentPersistence.test.ts`

**Step 1: Write the failing test**

Add tests covering:
- session creation/lookup persistence
- payment intent persistence
- deposit signature storage

**Step 2: Run test to verify it fails**

Run: `pnpm --dir server test`
Expected: FAIL due to missing persistence and signature storage.

**Step 3: Write minimal implementation**

- Extend schema with `chain_transactions` and explicit signature/status fields.
- Replace in-memory session and payment intent storage paths with repository-backed persistence.
- Save deposit signatures on both payment intent records and chain transaction records.

**Step 4: Run focused tests**

Run: `pnpm --dir server test -- paymentsAuth paymentPersistence`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/db/schema.ts server/src/modules/payments/repositories server/src/payments/service.ts server/src/payments/store.ts server/src/tests/paymentsAuth.test.ts server/src/tests/paymentPersistence.test.ts
git commit -m "feat: persist payment intents sessions and deposit signatures"
```

### Task 4: Implement Custodial Withdrawal And Payout Job Pipeline

**Files:**
- Create: `server/src/lib/solana/*.ts`
- Create: `server/src/workers/*.ts`
- Modify: `server/src/db/schema.ts`
- Modify: `server/src/payments/service.ts`
- Modify: `server/src/payments/store.ts`
- Modify: `server/src/payments/routes.ts`
- Create: `server/src/tests/withdrawalFlow.test.ts`

**Step 1: Write the failing test**

Add tests for:
- withdrawal reservation
- payout reservation
- persisted submission signature
- confirmed/failure status transitions

**Step 2: Run test to verify it fails**

Run: `pnpm --dir server test -- withdrawalFlow`
Expected: FAIL due to missing worker and signer flow.

**Step 3: Write minimal implementation**

- Add vault signer abstraction.
- Add transaction builder/broadcaster/confirmer modules.
- Add withdrawal and payout job records with lifecycle statuses.
- Save backend-submitted signatures and return them through service responses.

**Step 4: Run tests**

Run: `pnpm --dir server test -- withdrawalFlow`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/lib/solana server/src/workers server/src/db/schema.ts server/src/payments/service.ts server/src/payments/store.ts server/src/payments/routes.ts server/src/tests/withdrawalFlow.test.ts
git commit -m "feat: add custodial withdrawal and payout pipeline"
```

### Task 5: Split Multiplayer And Transport Code Out Of `index.ts`

**Files:**
- Create: `server/src/app/createHttpApp.ts`
- Create: `server/src/app/createSocketServer.ts`
- Create: `server/src/modules/multiplayer/*.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/tests/multiplayerGuards.test.ts`
- Create: `server/src/tests/multiplayerFlow.test.ts`

**Step 1: Write the failing test**

Add an integration-oriented test for room create/join/reconnect/cancel behavior through extracted services.

**Step 2: Run test to verify it fails**

Run: `pnpm --dir server test -- multiplayerFlow`
Expected: FAIL because modules do not exist yet.

**Step 3: Write minimal implementation**

- Move Express setup into `createHttpApp.ts`.
- Move Socket.IO registration into `createSocketServer.ts`.
- Move room lifecycle, queue lifecycle, reconnect handling, and settlement hooks into multiplayer modules.
- Reduce `server/src/index.ts` to dependency wiring and startup.

**Step 4: Run tests**

Run: `pnpm --dir server test -- multiplayerFlow multiplayerGuards`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/app server/src/modules/multiplayer server/src/index.ts server/src/tests/multiplayerGuards.test.ts server/src/tests/multiplayerFlow.test.ts
git commit -m "refactor: split backend transport and multiplayer modules"
```

### Task 6: Remove Drift Between Backend And Shared Contracts

**Files:**
- Modify: `server/src/index.ts`
- Modify: `shared/characters.ts`
- Modify: `shared/payment-contracts.ts`
- Test: `server/src/tests/multiplayerGuards.test.ts`

**Step 1: Write the failing test**

Add a test asserting backend character validation uses the shared roster.

**Step 2: Run test to verify it fails**

Run: `pnpm --dir server test -- multiplayerGuards`
Expected: FAIL due to stale backend allowlist.

**Step 3: Write minimal implementation**

- Import the shared character source of truth instead of duplicating IDs.
- Remove stale backend-local character constants.
- Tighten contract types where transaction signatures are required in responses.

**Step 4: Run tests**

Run: `pnpm --dir server test -- multiplayerGuards`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/index.ts shared/characters.ts shared/payment-contracts.ts server/src/tests/multiplayerGuards.test.ts
git commit -m "refactor: unify backend validation with shared contracts"
```

### Task 7: Final Verification And Cleanup

**Files:**
- Modify: `server/README.md`
- Modify: any touched backend module with final cleanup comments where needed

**Step 1: Run full backend test suite**

Run: `pnpm --dir server test`
Expected: PASS

**Step 2: Run typecheck**

Run: `pnpm --dir server exec tsc --noEmit --pretty false`
Expected: PASS

**Step 3: Run lint or formatting checks if added**

Run: project-specific check if backend lint is introduced during refactor
Expected: PASS

**Step 4: Update docs**

- Ensure README reflects final module layout, signer model, and signature persistence guarantees.

**Step 5: Commit**

```bash
git add server docs/plans
git commit -m "chore: finalize backend payments overhaul"
```
