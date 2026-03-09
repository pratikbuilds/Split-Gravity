import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const transactionDirectionEnum = pgEnum('transaction_direction', ['credit', 'debit']);
export const ledgerTransactionTypeEnum = pgEnum('ledger_transaction_type', [
  'entry_fee',
  'payout',
  'refund',
  'withdrawal',
]);
export const chainTransactionKindEnum = pgEnum('chain_transaction_kind', [
  'deposit',
  'withdrawal',
  'payout',
  'refund',
]);
export const chainTransactionStatusEnum = pgEnum('chain_transaction_status', [
  'pending',
  'submitted',
  'confirmed',
  'failed',
]);
export const paymentIntentPurposeEnum = pgEnum('payment_intent_purpose', [
  'single_paid_contest',
  'multi_paid_private',
  'multi_paid_queue',
]);
export const paymentIntentStatusEnum = pgEnum('payment_intent_status', [
  'pending',
  'confirmed',
  'expired',
]);
export const wagerStatusEnum = pgEnum('wager_status', [
  'awaiting_opponent',
  'awaiting_funding',
  'funded',
  'running',
  'settled',
  'cancelled',
  'refund_pending',
  'refunded',
]);
export const withdrawalStatusEnum = pgEnum('withdrawal_status', [
  'pending',
  'submitted',
  'confirmed',
  'failed',
]);

export const players = pgTable(
  'players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    walletAddress: varchar('wallet_address', { length: 64 }).notNull(),
    nickname: varchar('nickname', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    walletAddressIdx: uniqueIndex('players_wallet_address_idx').on(table.walletAddress),
  })
);

export const walletNonces = pgTable('wallet_nonces', {
  nonce: varchar('nonce', { length: 128 }).primaryKey(),
  walletAddress: varchar('wallet_address', { length: 64 }),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

export const walletSessions = pgTable('wallet_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  playerId: uuid('player_id')
    .references(() => players.id)
    .notNull(),
  token: varchar('token', { length: 128 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const supportedTokens = pgTable('supported_tokens', {
  id: varchar('id', { length: 64 }).primaryKey(),
  symbol: varchar('symbol', { length: 16 }).notNull(),
  name: varchar('name', { length: 64 }).notNull(),
  mint: varchar('mint', { length: 64 }),
  decimals: integer('decimals').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
});

export const entryFeeTiers = pgTable(
  'entry_fee_tiers',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    tokenId: varchar('token_id', { length: 64 })
      .references(() => supportedTokens.id)
      .notNull(),
    label: varchar('label', { length: 64 }).notNull(),
    amount: varchar('amount', { length: 32 }).notNull(),
    amountBaseUnits: bigint('amount_base_units', { mode: 'bigint' }).notNull(),
    currencySymbol: varchar('currency_symbol', { length: 16 }).notNull(),
  },
  (table) => ({
    tokenTierIdx: uniqueIndex('entry_fee_tiers_token_tier_idx').on(table.tokenId, table.label),
  })
);

export const dailyContests = pgTable(
  'daily_contests',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    tokenId: varchar('token_id', { length: 64 })
      .references(() => supportedTokens.id)
      .notNull(),
    entryFeeTierId: varchar('entry_fee_tier_id', { length: 64 })
      .references(() => entryFeeTiers.id)
      .notNull(),
    title: varchar('title', { length: 128 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    payoutBps: jsonb('payout_bps').notNull(),
  },
  (table) => ({
    contestBucketIdx: uniqueIndex('daily_contests_bucket_idx').on(table.tokenId, table.entryFeeTierId, table.startsAt),
  })
);

export const paymentIntents = pgTable('payment_intents', {
  id: uuid('id').defaultRandom().primaryKey(),
  playerId: uuid('player_id')
    .references(() => players.id)
    .notNull(),
  tokenId: varchar('token_id', { length: 64 })
    .references(() => supportedTokens.id)
    .notNull(),
  entryFeeTierId: varchar('entry_fee_tier_id', { length: 64 })
    .references(() => entryFeeTiers.id)
    .notNull(),
  purpose: paymentIntentPurposeEnum('purpose').notNull(),
  contestId: varchar('contest_id', { length: 128 }).references(() => dailyContests.id),
  status: paymentIntentStatusEnum('status').default('pending').notNull(),
  memo: varchar('memo', { length: 128 }).notNull(),
  vaultAddress: varchar('vault_address', { length: 64 }).notNull(),
  transactionSignature: varchar('transaction_signature', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const contestEntries = pgTable('contest_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  playerId: uuid('player_id')
    .references(() => players.id)
    .notNull(),
  contestId: varchar('contest_id', { length: 128 })
    .references(() => dailyContests.id)
    .notNull(),
  paymentIntentId: uuid('payment_intent_id')
    .references(() => paymentIntents.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const runSessions = pgTable('run_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  playerId: uuid('player_id')
    .references(() => players.id)
    .notNull(),
  contestEntryId: uuid('contest_entry_id')
    .references(() => contestEntries.id)
    .notNull(),
  status: varchar('status', { length: 24 }).default('active').notNull(),
  bestDistance: integer('best_distance'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leaderboardScores = pgTable(
  'leaderboard_scores',
  {
    contestId: varchar('contest_id', { length: 128 })
      .references(() => dailyContests.id)
      .notNull(),
    playerId: uuid('player_id')
      .references(() => players.id)
      .notNull(),
    bestDistance: integer('best_distance').notNull(),
    achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.contestId, table.playerId] }),
  })
);

export const ledgerTransactions = pgTable('ledger_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  playerId: uuid('player_id')
    .references(() => players.id)
    .notNull(),
  tokenId: varchar('token_id', { length: 64 })
    .references(() => supportedTokens.id)
    .notNull(),
  amountBaseUnits: bigint('amount_base_units', { mode: 'bigint' }).notNull(),
  direction: transactionDirectionEnum('direction').notNull(),
  type: ledgerTransactionTypeEnum('type').notNull(),
  externalRef: varchar('external_ref', { length: 128 }).notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chainTransactions = pgTable('chain_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  playerId: uuid('player_id')
    .references(() => players.id)
    .notNull(),
  tokenId: varchar('token_id', { length: 64 })
    .references(() => supportedTokens.id)
    .notNull(),
  kind: chainTransactionKindEnum('kind').notNull(),
  referenceId: varchar('reference_id', { length: 128 }).notNull(),
  status: chainTransactionStatusEnum('status').default('pending').notNull(),
  transactionSignature: varchar('transaction_signature', { length: 128 }),
  walletAddress: varchar('wallet_address', { length: 64 }),
  destinationAddress: varchar('destination_address', { length: 64 }),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
});

export const vaultTransfers = pgTable('vault_transfers', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentIntentId: uuid('payment_intent_id')
    .references(() => paymentIntents.id)
    .notNull(),
  transactionSignature: varchar('transaction_signature', { length: 128 }).notNull(),
  walletAddress: varchar('wallet_address', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pvpWagers = pgTable('pvp_wagers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tokenId: varchar('token_id', { length: 64 })
    .references(() => supportedTokens.id)
    .notNull(),
  entryFeeTierId: varchar('entry_fee_tier_id', { length: 64 })
    .references(() => entryFeeTiers.id)
    .notNull(),
  status: wagerStatusEnum('status').default('awaiting_opponent').notNull(),
  roomCode: varchar('room_code', { length: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const matchRooms = pgTable('match_rooms', {
  roomCode: varchar('room_code', { length: 8 }).primaryKey(),
  wagerId: uuid('wager_id').references(() => pvpWagers.id),
  kind: varchar('kind', { length: 24 }).default('casual').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const matchResults = pgTable('match_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  roomCode: varchar('room_code', { length: 8 })
    .references(() => matchRooms.roomCode)
    .notNull(),
  winnerPlayerId: uuid('winner_player_id').references(() => players.id),
  loserPlayerId: uuid('loser_player_id').references(() => players.id),
  reason: varchar('reason', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const withdrawalRequests = pgTable('withdrawal_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  playerId: uuid('player_id')
    .references(() => players.id)
    .notNull(),
  tokenId: varchar('token_id', { length: 64 })
    .references(() => supportedTokens.id)
    .notNull(),
  amountBaseUnits: bigint('amount_base_units', { mode: 'bigint' }).notNull(),
  destinationAddress: varchar('destination_address', { length: 64 }).notNull(),
  status: withdrawalStatusEnum('status').default('pending').notNull(),
  transactionSignature: varchar('transaction_signature', { length: 128 }),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
});

export const runtimeSnapshots = pgTable('runtime_snapshots', {
  namespace: varchar('namespace', { length: 64 }).primaryKey(),
  payload: jsonb('payload').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
