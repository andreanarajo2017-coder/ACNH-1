CREATE TYPE "public"."ai_interaction_status" AS ENUM('ready', 'needs_clarification', 'no_actionable_items', 'error', 'committed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_interactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"input_text" text NOT NULL,
	"output_json" jsonb NOT NULL,
	"status" "ai_interaction_status" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"latency_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_interactions_user_created_idx" ON "ai_interactions" USING btree ("user_id","created_at");