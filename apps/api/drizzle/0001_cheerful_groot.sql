CREATE TYPE "public"."event_source" AS ENUM('app', 'device_calendar');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('unprocessed', 'processed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('task', 'event', 'shopping_item');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('after', 'before', 'related');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('child', 'partner', 'family', 'friend', 'other');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('scheduled', 'sent', 'dismissed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reminder_target_type" AS ENUM('task', 'event');--> statement-breakpoint
CREATE TYPE "public"."reminder_trigger_type" AS ENUM('absolute', 'relative_to_start', 'location');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('manual', 'ai', 'device_calendar');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'postponed', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"start_date" date,
	"timezone" text,
	"location_text" text,
	"person_id" uuid,
	"category_id" uuid,
	"recurrence_rule" text,
	"source" "event_source" DEFAULT 'app' NOT NULL,
	"external_calendar_id" text,
	"external_event_id" text,
	"ai_interaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"status" "inbox_status" DEFAULT 'unprocessed' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_interaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_relations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"from_type" "item_type" NOT NULL,
	"from_id" uuid NOT NULL,
	"to_type" "item_type" NOT NULL,
	"to_id" uuid NOT NULL,
	"relation_type" "relation_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" "relationship" NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"birthday" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" "reminder_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"trigger_type" "reminder_trigger_type" NOT NULL,
	"trigger_at" timestamp with time zone,
	"offset_minutes" integer,
	"status" "reminder_status" DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"category_id" uuid,
	"person_id" uuid,
	"location_text" text,
	"due_date" date,
	"due_at" timestamp with time zone,
	"estimated_minutes" integer,
	"postponed_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"recurrence_rule" text,
	"series_id" uuid,
	"source" "task_source" DEFAULT 'manual' NOT NULL,
	"ai_interaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_relations" ADD CONSTRAINT "item_relations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_user_start_at_idx" ON "events" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_user_updated_idx" ON "events" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_items_user_status_idx" ON "inbox_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_relations_user_from_idx" ON "item_relations" USING btree ("user_id","from_type","from_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_status_trigger_at_idx" ON "reminders" USING btree ("status","trigger_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_status_due_date_idx" ON "tasks" USING btree ("user_id","status","due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_updated_idx" ON "tasks" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_due_date_xor_due_at" CHECK (num_nonnulls("due_date", "due_at") < 2);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_start_at_or_all_day" CHECK ("start_at" IS NOT NULL OR ("all_day" AND "start_date" IS NOT NULL));
