# Court Files Server

Express + Drizzle ORM API backed by Supabase Postgres for the Court Files frontend.

## Setup

1. Copy `.env.example` → `.env`
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`
3. Install & run:

```bash
npm install
npm run dev
```

API: `http://localhost:5500/api`

Runtime uses the Supabase JS client (`src/db/supabase.ts`) for API queries. Drizzle ORM (`src/db/drizzle.ts`) connects to Postgres for schema migrations and is available for typed queries via `db`.

## Database & migrations (Drizzle ORM)

Schema source of truth: `src/db/schema/index.ts`

Drizzle has **two** ways to update the database:

| Command | What it does |
|---------|----------------|
| `npm run db:sync` | **Sync local + production** — runs `drizzle-kit push --force` for `DATABASE_URL` in `.env` and `DATABASE_URL` in `.env.production` (or `DATABASE_URL_PRODUCTION`) |
| `npm run db:sync:local` | Sync **one** database (current `.env` only) |
| `npm run db:push` | Same as sync, but prompts before destructive changes (drops) |
| `npm run db:migrate` | Runs versioned SQL on **both** DBs (same URLs as `db:sync`) |
| `npm run db:migrate:local` | Migrate **one** database |
| `npm run cron:subscriptions` | Run subscription reconciliation + expiry emails once (PM2 also schedules daily via `ENABLE_SUBSCRIPTION_CRON`) |
| `npm run db:generate` | After editing schema, creates a new incremental SQL migration file |

### Recommended workflow

**Existing database** (tables already there, or mixed history):

```bash
npm run db:sync
```

This is what you want: if a table is missing it creates it; if a column is missing it adds it; if you removed a column from `schema/index.ts` it drops it from the DB.

Use `npm run db:push` instead if you want Drizzle to ask before dropping anything.

**Brand-new empty database** (no tables yet):

```bash
npm run db:migrate
```

Applies `drizzle/0000_init.sql` and any follow-up migrations.

**After you change `schema/index.ts`:**

- Day-to-day / existing DB: `npm run db:sync` (or `db:push` for prompts)
- Or: `npm run db:generate` then `npm run db:migrate` for a versioned migration file

### Why `db:migrate` failed on your DB

`db:migrate` does **not** check “table exists?” — it runs raw SQL in order. Your DB already had tables, so `0000_init.sql` (`CREATE TABLE users …`) failed before `0001` (add columns) could run. Use `db:sync` for that situation.

### Tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts |
| `pending_otps` | Registration OTP drafts |
| `password_resets` | Email reset tokens |
| `cases` | Court cases |
| `hearings` | Hearing history |
| `case_persons` | Per-clerk judges/advocates |
| `case_bench_history` | Bench assignment history |
| `user_proceedings` | Saved proceeding labels |
| `user_cities` | Saved city labels |
| `payments` | RapidGateway plan checkout records |

Optional: `npm run db:studio` to browse the database.

## Payments (Rapid Gateway)

Plans are defined in `src/services/plansCatalog.ts` (Monthly Rs 150, Yearly Rs 1400).

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/payments/plans` | No |
| POST | `/api/payments/initiate` | Yes — body `{ planId }` |
| POST | `/api/payments/guest-checkout` | No — guest buy |
| GET | `/api/payments` | Yes — history |
| GET | `/api/payments/:id` | Yes |
| POST | `/api/payments/demo-confirm` | Yes — only when RapidGateway keys are empty |
| POST | `/api/payments/rapidgateway/webhook` | No — signed Rapid Gateway webhook |

### What you need for live Rapid Gateway

1. Set `RAPIDGATEWAY_API_KEY`, `RAPIDGATEWAY_MERCHANT_ID`, and `RAPIDGATEWAY_WEBHOOK_SECRET`.
2. Set `API_PUBLIC_URL` (e.g. `https://api.clerkdiary.com`).
3. Register webhook in the Rapid portal:
   `{API_PUBLIC_URL}/api/payments/rapidgateway/webhook`
4. Keep API key and webhook salt **server only** — never in the frontend.

Without those env vars the app runs in **demo mode**: checkout stays on-site and you can simulate success.

## Deploy to EC2 (CI/CD)

Workflow: `.github/workflows/deploy-ec2.yml` (runs on push to `master`/`main`).

GitHub → **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|--------|---------|
| `EC2_HOST` | API EC2 public IP or hostname |
| `EC2_USER` | SSH user (e.g. `ubuntu`) |
| `EC2_SSH_KEY` | Private deploy key PEM |
| `EC2_APP_DIR` | Optional; default `/var/www/court-files-server` |

Server must already have Node 22, PM2, Nginx, and `/var/www/court-files-server/.env`.  
PM2 uses `ecosystem.config.cjs` from this repo. One-time EC2 bootstrap scripts stay on the machine only (not in git).

## Deploy to Vercel

The app is exported from `src/app.ts` and served as a single serverless
function via `api/index.ts`. `vercel.json` rewrites every request to it.

1. Import this repo as a new Vercel project (root directory = repo root).
2. No build command is needed (`vercel.json` skips the build step).
3. Set the environment variables in **Project → Settings → Environment Variables**:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key |
| `JWT_SECRET` | long random string |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `CORS_ORIGIN` | Comma-separated **browser** origins (SPA URL), e.g. `https://clerkdiary.com,https://www.clerkdiary.com` — not the API host |
| `FRONTEND_URL` | Primary SPA origin (must appear in `CORS_ORIGIN`); used in emails and payment return links |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail App Password |
| `MAIL_FROM` | e.g. `Court Files <you@gmail.com>` |
| `DATABASE_URL` | Supabase transaction pooler URI (port 6543) for Drizzle migrations |

4. Deploy. The API is served at `https://<project>.vercel.app/api`
   (health check: `/api/health`).

## Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | no | Draft registration + demo OTP |
| POST | `/api/auth/verify-otp` | no | Verify OTP, create user, return JWT |
| POST | `/api/auth/resend-otp` | no | Resend demo OTP |
| POST | `/api/auth/login` | no | Login with email/phone + password |
| POST | `/api/auth/forgot-password` | no | Email a password-reset link (no account enumeration) |
| POST | `/api/auth/reset-password` | no | Set a new password with the emailed token |
| GET | `/api/auth/me` | Bearer | Current user |
| POST | `/api/auth/change-password` | Bearer | Change password (requires current password) |

### Cases
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cases` | List current user's cases |
| GET | `/api/cases/today` | Cases with hearing today |
| GET | `/api/cases/tomorrow` | Cases with hearing tomorrow |
| GET | `/api/cases/hearing-dates` | Dates that have hearings |
| GET | `/api/cases/search?q=&mode=` | Search (`name` \| `caseId` \| `idCard`) |
| GET | `/api/cases/by-date?date=` | Cases on a date |
| GET | `/api/cases/category/:category` | Filter by court category |
| GET | `/api/cases/:id` | Get one case |
| POST | `/api/cases` | Create case (+ initial hearing) |
| PATCH | `/api/cases/:id` | Update case |
| POST | `/api/cases/:id/hearings` | Add hearing |
| DELETE | `/api/cases/:id` | Delete case |

All case routes require `Authorization: Bearer <token>`.

Responses mirror frontend shapes (`CourtCase` with nested parties, client, hearings).

## Database

Schema: `src/db/schema/index.ts`

**Existing DB:** `npm run db:sync` — adds missing tables/columns, drops removed columns.

**New empty DB:** `npm run db:migrate`

See **Database & migrations** above for full workflow.
