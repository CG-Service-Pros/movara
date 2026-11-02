CREATE TYPE "public"."person_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."team_member_role" AS ENUM('lead', 'member');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'paused', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."vision_scope" AS ENUM('company', 'team');--> statement-breakpoint
CREATE TYPE "public"."priority_level" AS ENUM('company', 'team', 'individual');--> statement-breakpoint
CREATE TYPE "public"."priority_status" AS ENUM('on_track', 'off_track', 'done', 'not_done', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."metric_comparison" AS ENUM('gte', 'lte', 'gt', 'lt', 'eq', 'between');--> statement-breakpoint
CREATE TYPE "public"."metric_unit" AS ENUM('number', 'percent', 'currency', 'duration', 'boolean');--> statement-breakpoint
CREATE TYPE "public"."scorecard_interval" AS ENUM('day', 'week', 'month', 'quarter');--> statement-breakpoint
CREATE TYPE "public"."issue_horizon" AS ENUM('short', 'long');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'solved', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('open', 'pending', 'done');--> statement-breakpoint
CREATE TYPE "public"."headline_kind" AS ENUM('customer', 'employee', 'general');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"quarter_calendar" jsonb DEFAULT '{"mode":"standard"}'::jsonb NOT NULL,
	"week_start_day" integer DEFAULT 1 NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"terminology_pack" jsonb,
	"terminology_previous_pack" jsonb,
	"terminology_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modules" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"role" "person_role" DEFAULT 'member' NOT NULL,
	"timezone" text,
	"reminder_schedule" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "team_member_role" DEFAULT 'member' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_team_id" uuid,
	"leader_id" uuid,
	"is_leadership" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"client" text,
	"oauth_client_id" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[],
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"agent_id" uuid,
	"client_id" text NOT NULL,
	"client_secret_hash" text,
	"name" text NOT NULL,
	"redirect_uris" text[] DEFAULT '{}' NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"agent_id" uuid,
	"token_hash" text NOT NULL,
	"kind" text DEFAULT 'access' NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vision_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"scope" "vision_scope" DEFAULT 'company' NOT NULL,
	"team_id" uuid
);
--> statement-breakpoint
CREATE TABLE "vision_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "revision_status" DEFAULT 'draft' NOT NULL,
	"content" jsonb DEFAULT '{"sections":{}}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" jsonb
);
--> statement-breakpoint
CREATE TABLE "chart_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"chart_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "revision_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" jsonb
);
--> statement-breakpoint
CREATE TABLE "charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"name" text DEFAULT 'Accountability chart' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"chart_revision_id" uuid NOT NULL,
	"title" text NOT NULL,
	"parent_seat_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"responsibilities" text[] DEFAULT '{}' NOT NULL,
	"person_ids" uuid[] DEFAULT '{}' NOT NULL,
	"assisting_agent_ids" uuid[] DEFAULT '{}' NOT NULL,
	"team_id" uuid,
	"linked_priority_id" uuid
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"priority_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"done_at" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_id" uuid,
	"team_id" uuid,
	"quarter" text NOT NULL,
	"due_date" date,
	"level" "priority_level" DEFAULT 'company' NOT NULL,
	"status" "priority_status" DEFAULT 'on_track' NOT NULL,
	"parent_priority_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"value" numeric,
	"note" text,
	"entered_by_actor" jsonb
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"title" text NOT NULL,
	"owner_ids" uuid[] DEFAULT '{}' NOT NULL,
	"comparison" "metric_comparison" DEFAULT 'gte' NOT NULL,
	"goal" numeric,
	"goal_upper" numeric,
	"unit" "metric_unit" DEFAULT 'number' NOT NULL,
	"scale" numeric DEFAULT 1 NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"additive" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"source" jsonb
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"interval" "scorecard_interval" DEFAULT 'week' NOT NULL,
	"week_start_day" integer DEFAULT 1 NOT NULL,
	"periods_shown" integer DEFAULT 13 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_id" uuid,
	"team_id" uuid,
	"horizon" "issue_horizon" DEFAULT 'short' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"solved_at" timestamp with time zone,
	"source" jsonb
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_id" uuid,
	"team_id" uuid,
	"due_date" date,
	"status" "todo_status" DEFAULT 'open' NOT NULL,
	"done_at" timestamp with time zone,
	"source" jsonb
);
--> statement-breakpoint
CREATE TABLE "headlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"text" text NOT NULL,
	"kind" "headline_kind" DEFAULT 'general' NOT NULL,
	"owner_id" uuid,
	"team_id" uuid,
	"reviewed_at" timestamp with time zone,
	"cascaded_from_id" uuid
);
--> statement-breakpoint
CREATE TABLE "meeting_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_key" text DEFAULT 'weekly' NOT NULL,
	"agenda" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rrule" text,
	"start_time" text,
	"duration_minutes" integer DEFAULT 90 NOT NULL,
	"attendee_ids" uuid[] DEFAULT '{}' NOT NULL,
	"facilitator_id" uuid,
	"scribe_actor" jsonb
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"recap_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"requested_by_actor" jsonb NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text,
	"request_id" text,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"decided_by" jsonb,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor" jsonb NOT NULL,
	"on_behalf_of" uuid,
	"command" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"diff" jsonb,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"command" text NOT NULL,
	"actor_id" text NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"response" jsonb,
	"http_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_leader_id_people_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_plans" ADD CONSTRAINT "vision_plans_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_plans" ADD CONSTRAINT "vision_plans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_revisions" ADD CONSTRAINT "vision_revisions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_revisions" ADD CONSTRAINT "vision_revisions_plan_id_vision_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."vision_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_revisions" ADD CONSTRAINT "chart_revisions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_revisions" ADD CONSTRAINT "chart_revisions_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_chart_revision_id_chart_revisions_id_fk" FOREIGN KEY ("chart_revision_id") REFERENCES "public"."chart_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_priority_id_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_scorecard_id_scorecards_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."scorecards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headlines" ADD CONSTRAINT "headlines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headlines" ADD CONSTRAINT "headlines_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headlines" ADD CONSTRAINT "headlines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_series" ADD CONSTRAINT "meeting_series_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_series" ADD CONSTRAINT "meeting_series_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_series" ADD CONSTRAINT "meeting_series_facilitator_id_people_id_fk" FOREIGN KEY ("facilitator_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_series_id_meeting_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."meeting_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_log" ADD CONSTRAINT "request_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_slug_uq" ON "orgs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "orgs_id_idx" ON "orgs" USING btree ("id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "people_org_idx" ON "people" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "people_org_email_uq" ON "people" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "people_org_user_idx" ON "people" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "people_user_idx" ON "people" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_person_uq" ON "team_members" USING btree ("team_id","person_id");--> statement-breakpoint
CREATE INDEX "team_members_org_team_idx" ON "team_members" USING btree ("org_id","team_id");--> statement-breakpoint
CREATE INDEX "team_members_org_person_idx" ON "team_members" USING btree ("org_id","person_id");--> statement-breakpoint
CREATE INDEX "teams_org_idx" ON "teams" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX "teams_org_parent_idx" ON "teams" USING btree ("org_id","parent_team_id");--> statement-breakpoint
CREATE INDEX "agents_org_idx" ON "agents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "agents_org_owner_idx" ON "agents" USING btree ("org_id","owner_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_org_agent_idx" ON "api_keys" USING btree ("org_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_client_id_uq" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_clients_org_idx" ON "oauth_clients" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_tokens_hash_uq" ON "oauth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "oauth_tokens_org_client_idx" ON "oauth_tokens" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "vision_plans_org_idx" ON "vision_plans" USING btree ("org_id","scope","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vision_revisions_plan_number_uq" ON "vision_revisions" USING btree ("plan_id","number");--> statement-breakpoint
CREATE INDEX "vision_revisions_org_plan_idx" ON "vision_revisions" USING btree ("org_id","plan_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_revisions_chart_number_uq" ON "chart_revisions" USING btree ("chart_id","number");--> statement-breakpoint
CREATE INDEX "chart_revisions_org_chart_idx" ON "chart_revisions" USING btree ("org_id","chart_id","status");--> statement-breakpoint
CREATE INDEX "charts_org_idx" ON "charts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "seats_org_revision_idx" ON "seats" USING btree ("org_id","chart_revision_id","sort");--> statement-breakpoint
CREATE INDEX "seats_org_parent_idx" ON "seats" USING btree ("org_id","parent_seat_id");--> statement-breakpoint
CREATE INDEX "milestones_org_priority_idx" ON "milestones" USING btree ("org_id","priority_id","sort");--> statement-breakpoint
CREATE INDEX "priorities_org_quarter_idx" ON "priorities" USING btree ("org_id","quarter","status");--> statement-breakpoint
CREATE INDEX "priorities_org_owner_idx" ON "priorities" USING btree ("org_id","owner_id");--> statement-breakpoint
CREATE INDEX "priorities_org_team_idx" ON "priorities" USING btree ("org_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_values_metric_period_uq" ON "metric_values" USING btree ("metric_id","period_start");--> statement-breakpoint
CREATE INDEX "metric_values_org_metric_idx" ON "metric_values" USING btree ("org_id","metric_id","period_start");--> statement-breakpoint
CREATE INDEX "metrics_org_scorecard_idx" ON "metrics" USING btree ("org_id","scorecard_id","sort");--> statement-breakpoint
CREATE INDEX "scorecards_org_team_idx" ON "scorecards" USING btree ("org_id","team_id");--> statement-breakpoint
CREATE INDEX "issues_org_team_status_idx" ON "issues" USING btree ("org_id","team_id","status","horizon","rank");--> statement-breakpoint
CREATE INDEX "issues_org_owner_idx" ON "issues" USING btree ("org_id","owner_id");--> statement-breakpoint
CREATE INDEX "todos_org_owner_status_idx" ON "todos" USING btree ("org_id","owner_id","status");--> statement-breakpoint
CREATE INDEX "todos_org_team_idx" ON "todos" USING btree ("org_id","team_id","status");--> statement-breakpoint
CREATE INDEX "headlines_org_team_idx" ON "headlines" USING btree ("org_id","team_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "headlines_org_owner_idx" ON "headlines" USING btree ("org_id","owner_id");--> statement-breakpoint
CREATE INDEX "meeting_series_org_team_idx" ON "meeting_series" USING btree ("org_id","team_id");--> statement-breakpoint
CREATE INDEX "meetings_org_series_idx" ON "meetings" USING btree ("org_id","series_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "approvals_org_status_idx" ON "approvals" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "audit_org_at_idx" ON "audit_events" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "audit_org_entity_idx" ON "audit_events" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_org_command_idx" ON "audit_events" USING btree ("org_id","command");--> statement-breakpoint
CREATE UNIQUE INDEX "request_log_org_request_uq" ON "request_log" USING btree ("org_id","request_id");--> statement-breakpoint
CREATE INDEX "request_log_org_created_idx" ON "request_log" USING btree ("org_id","created_at");