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

Runtime uses the Supabase JS client with the secret key. Drizzle schema stays in `src/db/schema` for reference / optional drizzle-kit.

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
| `CORS_ORIGIN` | deployed frontend URL, e.g. `https://your-frontend.vercel.app` |
| `FRONTEND_URL` | same frontend origin, used in password-reset emails |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail App Password |
| `MAIL_FROM` | e.g. `Court Files <you@gmail.com>` |

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

Tables (already applied on Supabase via migration):

- `users`
- `pending_otps`
- `password_resets`
- `cases`
- `hearings`

Drizzle schema: `src/db/schema/index.ts`
