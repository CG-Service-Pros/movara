CREATE TABLE "oauth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_actor" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "org_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_codes_hash_uq" ON "oauth_codes" USING btree ("code_hash");