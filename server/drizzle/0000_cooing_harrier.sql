CREATE TYPE "public"."chain_transaction_kind" AS ENUM('deposit', 'withdrawal', 'payout', 'refund');--> statement-breakpoint
CREATE TYPE "public"."chain_transaction_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_type" AS ENUM('entry_fee', 'payout', 'refund', 'withdrawal');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_purpose" AS ENUM('single_paid_contest', 'multi_paid_private', 'multi_paid_queue');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('pending', 'confirmed', 'refunded', 'settled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."transaction_direction" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."wager_status" AS ENUM('awaiting_opponent', 'awaiting_funding', 'funded', 'running', 'settled', 'cancelled', 'refund_pending', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TABLE "chain_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"kind" "chain_transaction_kind" NOT NULL,
	"reference_id" varchar(128) NOT NULL,
	"status" "chain_transaction_status" DEFAULT 'pending' NOT NULL,
	"transaction_signature" varchar(128),
	"wallet_address" varchar(64),
	"destination_address" varchar(64),
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contest_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"contest_id" varchar(128) NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_contests" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"entry_fee_tier_id" varchar(64) NOT NULL,
	"title" varchar(128) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"payout_bps" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_fee_tiers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"label" varchar(64) NOT NULL,
	"amount" varchar(32) NOT NULL,
	"amount_base_units" bigint NOT NULL,
	"currency_symbol" varchar(16) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_scores" (
	"contest_id" varchar(128) NOT NULL,
	"player_id" uuid NOT NULL,
	"best_distance" integer NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_scores_contest_id_player_id_pk" PRIMARY KEY("contest_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"amount_base_units" bigint NOT NULL,
	"direction" "transaction_direction" NOT NULL,
	"type" "ledger_transaction_type" NOT NULL,
	"external_ref" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" varchar(8) NOT NULL,
	"winner_player_id" uuid,
	"loser_player_id" uuid,
	"reason" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_rooms" (
	"room_code" varchar(8) PRIMARY KEY NOT NULL,
	"wager_id" uuid,
	"kind" varchar(24) DEFAULT 'casual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"entry_fee_tier_id" varchar(64) NOT NULL,
	"purpose" "payment_intent_purpose" NOT NULL,
	"contest_id" varchar(128),
	"status" "payment_intent_status" DEFAULT 'pending' NOT NULL,
	"memo" varchar(128) NOT NULL,
	"vault_address" varchar(64) NOT NULL,
	"transaction_signature" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(64) NOT NULL,
	"nickname" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pvp_wagers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"entry_fee_tier_id" varchar(64) NOT NULL,
	"status" "wager_status" DEFAULT 'awaiting_opponent' NOT NULL,
	"room_code" varchar(8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"contest_entry_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"best_distance" integer,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_snapshots" (
	"namespace" varchar(64) PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supported_tokens" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"name" varchar(64) NOT NULL,
	"mint" varchar(64),
	"decimals" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"transaction_signature" varchar(128) NOT NULL,
	"wallet_address" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_nonces" (
	"nonce" varchar(128) PRIMARY KEY NOT NULL,
	"wallet_address" varchar(64),
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wallet_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"amount_base_units" bigint NOT NULL,
	"destination_address" varchar(64) NOT NULL,
	"status" "withdrawal_status" DEFAULT 'pending' NOT NULL,
	"transaction_signature" varchar(128),
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_token_id_supported_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."supported_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_contest_id_daily_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."daily_contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_contests" ADD CONSTRAINT "daily_contests_token_id_supported_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."supported_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_contests" ADD CONSTRAINT "daily_contests_entry_fee_tier_id_entry_fee_tiers_id_fk" FOREIGN KEY ("entry_fee_tier_id") REFERENCES "public"."entry_fee_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_fee_tiers" ADD CONSTRAINT "entry_fee_tiers_token_id_supported_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."supported_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_scores" ADD CONSTRAINT "leaderboard_scores_contest_id_daily_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."daily_contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_scores" ADD CONSTRAINT "leaderboard_scores_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_token_id_supported_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."supported_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_room_code_match_rooms_room_code_fk" FOREIGN KEY ("room_code") REFERENCES "public"."match_rooms"("room_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_winner_player_id_players_id_fk" FOREIGN KEY ("winner_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_loser_player_id_players_id_fk" FOREIGN KEY ("loser_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rooms" ADD CONSTRAINT "match_rooms_wager_id_pvp_wagers_id_fk" FOREIGN KEY ("wager_id") REFERENCES "public"."pvp_wagers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_token_id_supported_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."supported_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_entry_fee_tier_id_entry_fee_tiers_id_fk" FOREIGN KEY ("entry_fee_tier_id") REFERENCES "public"."entry_fee_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_contest_id_daily_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."daily_contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_wagers" ADD CONSTRAINT "pvp_wagers_token_id_supported_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."supported_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_wagers" ADD CONSTRAINT "pvp_wagers_entry_fee_tier_id_entry_fee_tiers_id_fk" FOREIGN KEY ("entry_fee_tier_id") REFERENCES "public"."entry_fee_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sessions" ADD CONSTRAINT "run_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sessions" ADD CONSTRAINT "run_sessions_contest_entry_id_contest_entries_id_fk" FOREIGN KEY ("contest_entry_id") REFERENCES "public"."contest_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_transfers" ADD CONSTRAINT "vault_transfers_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_sessions" ADD CONSTRAINT "wallet_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_token_id_supported_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."supported_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_contests_bucket_idx" ON "daily_contests" USING btree ("token_id","entry_fee_tier_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_fee_tiers_token_tier_idx" ON "entry_fee_tiers" USING btree ("token_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "players_wallet_address_idx" ON "players" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "contest_entries_payment_intent_idx" ON "contest_entries" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_transaction_signature_idx" ON "payment_intents" USING btree ("transaction_signature");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_sessions_token_idx" ON "wallet_sessions" USING btree ("token");
