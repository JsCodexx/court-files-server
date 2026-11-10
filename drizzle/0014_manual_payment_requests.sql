CREATE TABLE IF NOT EXISTS "manual_payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"amount_pkr" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_to_method" text NOT NULL,
	"transaction_id" text NOT NULL,
	"sender_account_name" text NOT NULL,
	"sender_account_title" text NOT NULL DEFAULT '',
	"sender_phone" text NOT NULL DEFAULT '',
	"notes" text NOT NULL DEFAULT '',
	"admin_note" text NOT NULL DEFAULT '',
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_payment_requests" ADD CONSTRAINT "manual_payment_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_requests" ADD CONSTRAINT "manual_payment_requests_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_manual_payment_requests_user_id" ON "manual_payment_requests" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_manual_payment_requests_status" ON "manual_payment_requests" USING btree ("status");
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value") VALUES ('manual_payment_enabled', 'true')
ON CONFLICT ("key") DO NOTHING;
