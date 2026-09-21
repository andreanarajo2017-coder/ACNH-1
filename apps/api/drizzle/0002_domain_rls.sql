-- Row-Level Security (section 6): defense in depth on top of the app-layer
-- `WHERE user_id = ...` filtering already present in every query. Policies
-- key off `app.user_id`, a session-scoped setting the API sets per request
-- (see src/plugins/auth.ts). With no `app.user_id` set, `current_setting`
-- returns NULL and every policy denies all rows (default-deny).
--
-- FORCE ROW LEVEL SECURITY is required in addition to ENABLE: the app
-- connects as the same role that owns these tables (table owners bypass
-- RLS by default otherwise).
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "categories_user_isolation" ON "categories"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "people_user_isolation" ON "people"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_user_isolation" ON "tasks"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "events_user_isolation" ON "events"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "inbox_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbox_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "inbox_items_user_isolation" ON "inbox_items"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "item_relations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_relations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "item_relations_user_isolation" ON "item_relations"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reminders_user_isolation" ON "reminders"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);
