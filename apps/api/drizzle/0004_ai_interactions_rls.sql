-- Same defense-in-depth pattern as 0002_domain_rls.sql: ai_interactions
-- holds raw capture text and LLM output (10.4: never let a query, prompt or
-- response leak across users), so it gets the same RLS treatment as every
-- other domain table.
--> statement-breakpoint
ALTER TABLE "ai_interactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_interactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_interactions_user_isolation" ON "ai_interactions"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);
