# Runner Backend

Backend for the Runner mobile game. It currently serves:

- realtime multiplayer over Socket.IO
- wallet auth and payment intent APIs
- contest entry and run submission APIs
- custodial payment infrastructure groundwork

## Status

The backend is in transition from an in-memory prototype to a modular, Postgres-backed custodial system. Some payment flows are still prototype-grade today. The approved redesign and implementation plan live in:

- `docs/plans/2026-03-09-backend-payments-redesign-design.md`
- `docs/plans/2026-03-09-backend-payments-overhaul.md`

## Testing with the app locally

1. Start the backend: `pnpm --dir server dev` (port 4100).
2. Start the app: `pnpm dev` (Expo in LAN mode; avoid `--tunnel` for local backend).
3. Ensure device and machine are on the same Wi‑Fi, then scan the QR code.
4. The app infers the backend URL from the Metro host (e.g. `http://<your-lan-ip>:4100`). If it doesn’t connect, set `EXPO_PUBLIC_BACKEND_URL=http://<your-lan-ip>:4100` in the project root `.env` (see root `.env.example`).
5. If Socket.IO rejects the connection, add your Metro origin to `SOCKET_IO_CORS_ORIGINS` in `server/.env` (e.g. `http://192.168.1.100:8081`).
6. For AI Runner Lab locally, set `SERVER_PUBLIC_BASE_URL=http://<your-lan-ip>:4100` in `server/.env` so generated sprite URLs are reachable from your phone/emulator.

## Deploy and test on device

1. **Push and deploy server** — Push the branch and deploy the server (e.g. Railway). Use the **public** Postgres URL (not `*railway.internal`). Set `CHARACTER_GENERATION_ENABLED=1`, `GEMINI_API_KEY`, and either `CHARACTER_BUCKET_*` (recommended for production) or set `SERVER_PUBLIC_BASE_URL` to the deployed server URL.
2. **Point the app at the deployed backend** — In the repo root `.env` set `EXPO_PUBLIC_BACKEND_URL=https://<your-deployed-server>` (no trailing slash).
3. **Build and run on a physical device** — `pnpm dev` then open the app on the device (same network as Metro), or `eas build --profile preview --platform ios` (or `android`) and install the built app. The app uses `EXPO_PUBLIC_BACKEND_URL` from the build.
4. **Smoke-check character generation** — In the app open Runner Lab, connect wallet, pay entry if required, submit a prompt. Confirm job goes queued → running → succeeded and the sprite appears. If the worker is not running, the UI shows an amber banner (`workerRunning: false`).

## Scripts

Push changes

From the repo root:

```bash
pnpm --dir server install
pnpm --dir server dev
pnpm --dir server test
pnpm --dir server typecheck
pnpm --dir server db:generate
pnpm --dir server db:push
```

## Environment

Copy `server/.env.example` and set:

- `PORT`: HTTP/WebSocket server port. Default `4100`.
- `LOG_LEVEL`: `error`, `warn`, `info`, or `debug`.
- `LOG_STATE_EVENTS`: `1` to emit verbose room state logs.
- `ENABLE_RUNTIME_PERSISTENCE`: set to `1` to hydrate and persist wallet auth plus payment runtime state through Postgres snapshots.
- `DATABASE_URL`: Postgres connection string used by Drizzle and the optional runtime persistence layer.
- `SOLANA_RPC_HTTP`: Solana HTTP RPC endpoint.
- `SOLANA_RPC_WS`: Solana WebSocket endpoint for subscriptions/confirmation flows.
- `VAULT_PUBLIC_KEY`: custodial vault address that receives deposits and sends payouts/withdrawals.
- `VAULT_SECRET_KEY_JSON`: 64-byte secret key JSON for the custodial signer. This should eventually move behind a safer signer boundary.
- `SERVER_PUBLIC_BASE_URL`: the base URL devices should use to fetch generated character assets when local file storage is active.
- `CHARACTER_GENERATION_ENABLED`: set to `1` to enable the AI Runner Lab endpoints.
- `GEMINI_API_KEY`: required by the Gemini sprite generation pipeline.
- `CHARACTER_LOCAL_ASSET_DIR`: optional local output directory for generated sprite and thumbnail PNGs.
- `CHARACTER_BUCKET_*`: optional S3-compatible storage settings. If omitted, the backend now falls back to local file storage and serves assets from `/character-assets/*`.

## Payment Model

Current direction:

- deposits are user-signed and verified by the backend
- payouts and withdrawals are backend-built, backend-signed, backend-submitted
- deposit and withdrawal transaction signatures must be persisted and returned to the UI
- withdrawals should reserve funds first, then advance through `pending -> submitted -> confirmed/failed`

Current prototype behavior:

- the backend can now build unsigned deposit transactions for the client to sign and send
- confirmed payment intents now persist the user deposit signature and return it from the API
- deposit confirmation verifies the on-chain transfer against wallet, vault, amount, and memo when `SOLANA_RPC_HTTP` is configured
- withdrawals now lock balance while the vault transfer is pending/submitted instead of debiting immediately
- when `VAULT_SECRET_KEY_JSON` is configured, withdrawals are signed, sent, and confirmed by the backend in the same request
- paid multiplayer winner-take-all settlement now uses the same backend-signed vault outflow path and can attach the payout signature to the match result
- paid room refunds now try to refund on-chain from the vault before falling back to internal credit bookkeeping
- ledger balances now treat entry-fee funding as committed game spend, not as negative withdrawable balance
- the in-memory store already exposes submission/confirmation/failure transitions for future worker wiring
- when `ENABLE_RUNTIME_PERSISTENCE=1`, wallet auth state plus payment runtime state are hydrated on startup and persisted back to Postgres after each mutation through the `runtime_snapshots` table

This means the backend needs:

- a vault signer abstraction
- worker-based payout and withdrawal processing

The current durability layer is operationally useful, but it is still a transitional step:

- it persists the whole runtime model through transactional snapshots instead of fully normalized repositories
- it makes restarts safe for auth sessions, payment intents, ledger state, withdrawals, and chain metadata
- the next cleanup step is replacing snapshot persistence with per-aggregate Postgres repositories and background workers

## Architecture Direction

Current bootstrap split:

- `src/app/`: HTTP and Socket.IO bootstrap
- `src/config/`: typed env parsing
- `src/lib/`: logger, DB, Solana adapters
- `src/multiplayer/runtime.ts`: room/session runtime types and snapshot helpers
- `src/multiplayer/server.ts`: realtime room, queue, reconnect, settlement, and eviction flow
- `src/payments/`: payment intents, ledger, withdrawals, payouts
- `src/lib/runtimeStateRepository.ts`: Postgres-backed runtime snapshot persistence

Target next split:

- `src/modules/multiplayer/`: room and queue services
- `src/modules/contests/`: contest entries, score submission, settlement
- `src/workers/`: payout, withdrawal, reconciliation jobs

## Immediate Issues To Keep In Mind

- `src/index.ts` is now a thin bootstrap, but `src/multiplayer/server.ts` is still too large and still mixes transport with domain logic.
- runtime persistence currently uses snapshot hydration instead of normalized repositories
- daily contest settlement still credits internal balance instead of broadcasting payouts directly

Do not treat the current in-memory payment bookkeeping as production-safe.

## Devnet Verification

The backend test suite includes a devnet-gated end-to-end payment flow:

```bash
cd server
RUN_DEVNET_PAYMENT_E2E=1 pnpm test -- paymentFlow.e2e
```

The test:

- loads the Solana CLI wallet from `~/.config/solana/id.json` by default
- funds ephemeral winner/loser/vault wallets on devnet
- creates payment intents
- asks the backend to build unsigned deposit transactions
- signs and sends those deposits as the user wallets
- confirms them through backend on-chain verification
- settles a winner-take-all result through the backend-controlled vault
- executes a backend-signed withdrawal and asserts the destination received lamports
