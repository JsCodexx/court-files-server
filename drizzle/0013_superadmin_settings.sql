ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" text DEFAULT 'true' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_superadmin" text DEFAULT 'false' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value") VALUES ('plan_monthly_amount_pkr', '150')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value") VALUES ('plan_yearly_amount_pkr', '1400')
ON CONFLICT ("key") DO NOTHING;
