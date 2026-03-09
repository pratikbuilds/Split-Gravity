ALTER TYPE "public"."payment_intent_purpose" ADD VALUE IF NOT EXISTS 'character_generation';--> statement-breakpoint
CREATE TYPE "public"."character_generation_source_type" AS ENUM('prompt', 'image');--> statement-breakpoint
CREATE TYPE "public"."character_generation_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'refunded');--> statement-breakpoint

CREATE TABLE "custom_characters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL,
  "display_name" varchar(64) NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "character_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL,
  "source_type" "character_generation_source_type" NOT NULL,
  "display_name" varchar(64),
  "prompt" text,
  "reference_image_data_url" text,
  "payment_intent_id" uuid,
  "status" "character_generation_job_status" DEFAULT 'queued' NOT NULL,
  "failure_message" text,
  "result_character_id" uuid,
  "result_version_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "custom_character_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "custom_character_id" uuid NOT NULL,
  "generation_job_id" uuid,
  "sheet_object_key" text NOT NULL,
  "thumbnail_object_key" text,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "grid_columns" integer DEFAULT 6 NOT NULL,
  "grid_rows" integer DEFAULT 3 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "player_active_characters" (
  "player_id" uuid PRIMARY KEY NOT NULL,
  "character_id" varchar(32) NOT NULL,
  "custom_character_version_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "player_push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL,
  "expo_push_token" varchar(256) NOT NULL,
  "platform" varchar(16) NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "character_generation_jobs" ADD CONSTRAINT "character_generation_jobs_payment_intent_id_payment_intents_id_fk"
  FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_generation_jobs" ADD CONSTRAINT "character_generation_jobs_result_character_id_custom_characters_id_fk"
  FOREIGN KEY ("result_character_id") REFERENCES "public"."custom_characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_character_versions" ADD CONSTRAINT "custom_character_versions_custom_character_id_custom_characters_id_fk"
  FOREIGN KEY ("custom_character_id") REFERENCES "public"."custom_characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_character_versions" ADD CONSTRAINT "custom_character_versions_generation_job_id_character_generation_jobs_id_fk"
  FOREIGN KEY ("generation_job_id") REFERENCES "public"."character_generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_active_characters" ADD CONSTRAINT "player_active_characters_custom_character_version_id_custom_character_versions_id_fk"
  FOREIGN KEY ("custom_character_version_id") REFERENCES "public"."custom_character_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "player_push_tokens_token_idx" ON "player_push_tokens" USING btree ("expo_push_token");--> statement-breakpoint
