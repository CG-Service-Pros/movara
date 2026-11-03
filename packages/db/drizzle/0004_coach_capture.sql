CREATE TYPE "public"."capture_kind" AS ENUM('todo', 'issue', 'headline', 'decision');--> statement-breakpoint
CREATE TYPE "public"."capture_status" AS ENUM('proposed', 'accepted', 'rejected', 'edited');--> statement-breakpoint
CREATE TYPE "public"."ai_feature" AS ENUM('coach', 'extract');--> statement-breakpoint
CREATE TYPE "public"."coach_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TABLE "capture_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"notes_id" uuid NOT NULL,
	"kind" "capture_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "capture_status" DEFAULT 'proposed' NOT NULL,
	"created_entity_id" uuid,
	"decided_by" jsonb,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"source_app" text DEFAULT 'manual' NOT NULL,
	"source_url" text,
	"title" text,
	"notes_markdown" text DEFAULT '' NOT NULL,
	"transcript" text,
	"captured_by_actor" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"person_id" uuid,
	"feature" "ai_feature" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_estimate_usd" numeric(12, 6),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "coach_role" NOT NULL,
	"content" jsonb,
	"tool_calls" jsonb,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"base_url" text,
	"api_key_ciphertext" text,
	"api_key_iv" text,
	"api_key_tag" text,
	"api_key_last4" text,
	"model" text DEFAULT 'gpt-5.6-luna' NOT NULL,
	"reasoning_effort" text DEFAULT 'low' NOT NULL,
	"monthly_token_limit" integer,
	"coach_name" text DEFAULT 'Coach' NOT NULL,
	"coach_personality" text DEFAULT 'Warm, direct and practical. Coaches on accountability and clarity.' NOT NULL,
	"updated_by" jsonb
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "kind" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "preset" text;--> statement-breakpoint
ALTER TABLE "capture_items" ADD CONSTRAINT "capture_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_items" ADD CONSTRAINT "capture_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_items" ADD CONSTRAINT "capture_items_notes_id_meeting_notes_id_fk" FOREIGN KEY ("notes_id") REFERENCES "public"."meeting_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_thread_id_coach_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."coach_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_threads" ADD CONSTRAINT "coach_threads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_threads" ADD CONSTRAINT "coach_threads_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_ai_settings" ADD CONSTRAINT "org_ai_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_items_org_status_idx" ON "capture_items" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "capture_items_meeting_idx" ON "capture_items" USING btree ("org_id","meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_notes_org_meeting_idx" ON "meeting_notes" USING btree ("org_id","meeting_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_org_at_idx" ON "ai_usage" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "coach_messages_thread_idx" ON "coach_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "coach_threads_org_person_idx" ON "coach_threads" USING btree ("org_id","person_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_ai_settings_org_uq" ON "org_ai_settings" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_one_coach_uq" ON "agents" USING btree ("org_id") WHERE "agents"."kind" = 'builtin_coach';