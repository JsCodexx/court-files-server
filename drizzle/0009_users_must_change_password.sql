ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" text DEFAULT 'false' NOT NULL;
