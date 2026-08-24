ALTER TABLE "pending_otps" ADD COLUMN "otp_attempts" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" text DEFAULT '0' NOT NULL;