CREATE TABLE "case_bench_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"judge_person_id" uuid,
	"party1_advocate_id" uuid,
	"party2_advocate_id" uuid,
	"judge_name" text DEFAULT '' NOT NULL,
	"party1_advocate" text DEFAULT '' NOT NULL,
	"party2_advocate" text DEFAULT '' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"category" text NOT NULL,
	"party1_name" text NOT NULL,
	"party1_id_card" text NOT NULL,
	"party1_phone" text NOT NULL,
	"party2_name" text NOT NULL,
	"party2_id_card" text NOT NULL,
	"party2_phone" text NOT NULL,
	"court_number" text,
	"city" text DEFAULT '' NOT NULL,
	"judge_name" text NOT NULL,
	"advocate_for" text NOT NULL,
	"party1_advocate" text DEFAULT '' NOT NULL,
	"party2_advocate" text DEFAULT '' NOT NULL,
	"judge_person_id" uuid,
	"party1_advocate_id" uuid,
	"party2_advocate_id" uuid,
	"next_date" date NOT NULL,
	"proceeding" text DEFAULT '' NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_remarks" text DEFAULT '' NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"client_address" text DEFAULT '' NOT NULL,
	"client_phone" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"date" date NOT NULL,
	"proceeding" text DEFAULT '' NOT NULL,
	"adjournment_reason" text DEFAULT '' NOT NULL,
	"short_order" text DEFAULT '' NOT NULL,
	"remarks" text,
	"judge_name" text DEFAULT '' NOT NULL,
	"party1_advocate" text DEFAULT '' NOT NULL,
	"party2_advocate" text DEFAULT '' NOT NULL,
	"judge_person_id" uuid,
	"party1_advocate_id" uuid,
	"party2_advocate_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "password_resets_email_unique" UNIQUE("email"),
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pending_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"otp" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"bar_address" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pending_otps_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "user_proceedings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"bar_address" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "case_bench_history" ADD CONSTRAINT "case_bench_history_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_bench_history" ADD CONSTRAINT "case_bench_history_judge_person_id_case_persons_id_fk" FOREIGN KEY ("judge_person_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_bench_history" ADD CONSTRAINT "case_bench_history_party1_advocate_id_case_persons_id_fk" FOREIGN KEY ("party1_advocate_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_bench_history" ADD CONSTRAINT "case_bench_history_party2_advocate_id_case_persons_id_fk" FOREIGN KEY ("party2_advocate_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_persons" ADD CONSTRAINT "case_persons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_judge_person_id_case_persons_id_fk" FOREIGN KEY ("judge_person_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_party1_advocate_id_case_persons_id_fk" FOREIGN KEY ("party1_advocate_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_party2_advocate_id_case_persons_id_fk" FOREIGN KEY ("party2_advocate_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_judge_person_id_case_persons_id_fk" FOREIGN KEY ("judge_person_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_party1_advocate_id_case_persons_id_fk" FOREIGN KEY ("party1_advocate_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_party2_advocate_id_case_persons_id_fk" FOREIGN KEY ("party2_advocate_id") REFERENCES "public"."case_persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_proceedings" ADD CONSTRAINT "user_proceedings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_case_bench_history_case_id" ON "case_bench_history" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_case_persons_user_id" ON "case_persons" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_case_persons_user_role_name" ON "case_persons" USING btree ("user_id","role",lower(trim("name")));--> statement-breakpoint
CREATE INDEX "idx_cases_user_id" ON "cases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cases_next_date" ON "cases" USING btree ("next_date");--> statement-breakpoint
CREATE INDEX "idx_cases_case_id" ON "cases" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_hearings_case_id" ON "hearings" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_hearings_date" ON "hearings" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_proceedings_user_label" ON "user_proceedings" USING btree ("user_id",lower(trim("label")));