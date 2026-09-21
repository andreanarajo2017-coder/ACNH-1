CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('reminder', 'upcoming_event', 'overdue_task', 'daily_summary', 'conflict_alert', 'contextual_recommendation');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"push_token" text NOT NULL,
	"app_version" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"dedupe_key" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_type_settings" (
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_type_settings_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_type_settings" ADD CONSTRAINT "notification_type_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devices_user_token_idx" ON "devices" USING btree ("user_id","push_token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_log_user_dedupe_idx" ON "notification_log" USING btree ("user_id","dedupe_key");