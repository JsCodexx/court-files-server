-- Explicit deny for PostgREST / publishable key (anon + authenticated).
-- Service role and postgres owner used by Express still bypass RLS.

CREATE POLICY "deny_direct_api" ON "public"."users"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."pending_otps"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."password_resets"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."case_persons"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."cases"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."hearings"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."case_bench_history"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."user_proceedings"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."user_cities"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."payments"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY "deny_direct_api" ON "public"."subscriptions"
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
