# Backend Payments And Multiplayer Redesign

## Goals

- Replace the current in-memory payment/session state with durable Postgres-backed state.
- Replace fake payout and withdrawal bookkeeping with real custodial vault transaction flows.
- Break the backend into maintainable modules so `server/src/index.ts` stops owning every concern.
- Document the backend runtime, env surface, and operational expectations.

## Current Problems

- `server/src/index.ts` mixes HTTP bootstrap, Socket.IO setup, room lifecycle, matchmaking, paid room validation, refunds, and settlement logic.
- `server/src/payments/service.ts` and `server/src/payments/store.ts` use in-memory `Map`s for sessions, nonces, payment intents, ledger balances, contest state, payouts, and withdrawals.
- `server/src/payments/store.ts` marks payouts, refunds, and withdrawals as if they happened on-chain, but no real vault signer or chain submission exists.
- `server/src/payments/config.ts` exposes a vault public key only; there is no server-controlled signer abstraction.
- Backend character validation is already stale relative to the frontend roster.
- There is no backend README or `.env.example`.

## Approved Constraints

- Custodial for now.
- Deposits are user-signed.
- Payouts and withdrawals are backend-built, backend-signed, backend-sent.
- The UI should display the resulting transaction signature for deposits and withdrawals.
- Withdrawals and payouts should send automatically after approval, with no operator review step.

## Proposed Architecture

### Layers

- `transport`
  Express routes and Socket.IO event registration only.
- `domain`
  Matchmaking, room lifecycle, payment intents, deposit verification, ledger logic, contests, payouts, withdrawals.
- `data`
  Drizzle repositories, DB transactions, row locking, persistence mapping.
- `chain`
  Solana RPC access, transaction construction, vault signing, send/confirm flows, reconciliation.

### Target Module Layout

- `server/src/app/createHttpApp.ts`
- `server/src/app/createSocketServer.ts`
- `server/src/config/env.ts`
- `server/src/lib/logger.ts`
- `server/src/lib/db.ts`
- `server/src/lib/solana/`
- `server/src/modules/multiplayer/`
- `server/src/modules/payments/`
- `server/src/modules/contests/`
- `server/src/workers/`

## Ledger Model

Postgres is the source of truth. Chain signatures are evidence attached to ledger events, not the ledger itself.

### Core Tables

- `players`
- `wallet_sessions`
- `wallet_nonces`
- `payment_intents`
- `ledger_entries`
- `ledger_account_balances`
- `withdrawal_requests`
- `payout_jobs`
- `chain_transactions`
- `match_wagers`
- `contest_entries`
- `run_sessions`

### Lifecycle Rules

- Deposit:
  Create payment intent -> client signs/sends tx -> backend verifies chain transfer -> DB transaction marks intent confirmed and posts ledger entries.
- Match payout:
  Reserve funds -> create payout job -> worker signs and submits vault outflow -> confirm -> finalize ledger and expose tx signature.
- Withdrawal:
  Validate balance -> reserve funds -> create withdrawal job -> worker signs and submits vault outflow -> confirm -> finalize ledger and expose tx signature.
- Refund:
  Reserve/refund within DB transaction -> worker handles chain outflow if needed -> persist tx signature and final state.

### Atomicity Requirements

Every state transition that changes balances must happen inside a DB transaction:

- validate business rule
- reserve or release balance
- create job record
- create chain transaction record
- persist new status

This prevents races like duplicate withdrawal, payout versus withdrawal double-spend, or replay of a payment intent.

## Transaction Signature Persistence

- Deposit signatures are stored on the payment intent and also in `chain_transactions`.
- Withdrawal and payout signatures are stored on the withdrawal/payout job and also in `chain_transactions`.
- API responses should expose the final chain signature so the mobile UI can display it directly.

## Custodial Signing Model

- User signs:
  Entry-fee deposits and any transaction spending user-owned funds.
- Backend signs:
  Payouts, refunds, and withdrawals that spend vault-controlled funds.

The backend should have a signer abstraction, not direct ad hoc keypair usage throughout the codebase.

## Solana Flow Choice

- Deposits can follow a Solana Pay-style flow or a backend-built unsigned transaction flow.
- Payouts and withdrawals should not use a user co-sign path; the backend should build, sign, submit, and confirm these using the custodial vault authority.

## Testing Strategy

- Repository tests for DB transaction behavior and balance reservation.
- Service tests for payment intent confirmation, refund, contest entry, settlement, and withdrawal initiation.
- Worker tests for `pending -> submitted -> confirmed/failed` transitions.
- Integration tests for paid room cancellation/refund and winner-take-all payout.
- Boot tests for env validation and dependency wiring.

## Delivery Order

1. Add backend README and `.env.example`.
2. Add typed env validation and central logger.
3. Wire runtime DB access and repositories.
4. Introduce vault signer and chain adapter modules.
5. Replace deposit confirmation with real persistence and signature storage.
6. Implement withdrawal and payout jobs with persisted signatures.
7. Split `server/src/index.ts` into modules.
8. Add tests and remove obsolete in-memory payment state.
