-- M6: same defense-in-depth RLS pattern as 0002_domain_rls.sql / ADR-007 —
-- drizzle-kit doesn't generate RLS SQL, so this is hand-written.
--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "devices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "devices_user_isolation" ON "devices"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "notification_type_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_type_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_type_settings_user_isolation" ON "notification_type_settings"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_log_user_isolation" ON "notification_log"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);
