-- Block direct PostgREST / anon / authenticated access. Express API uses service role (bypasses RLS).
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."pending_otps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."password_resets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."case_persons" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."cases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."hearings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."case_bench_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."user_proceedings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."user_cities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;
