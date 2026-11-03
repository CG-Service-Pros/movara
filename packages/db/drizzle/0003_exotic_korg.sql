ALTER TABLE "people" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "people_invite_hash_uq" ON "people" USING btree ("invite_token_hash");