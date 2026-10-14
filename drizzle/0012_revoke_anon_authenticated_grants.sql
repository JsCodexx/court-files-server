REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO anon, authenticated;
