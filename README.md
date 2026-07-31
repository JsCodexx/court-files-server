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

## Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | no | Draft registration + demo OTP |
| POST | `/api/auth/verify-otp` | no | Verify OTP, create user, return JWT |
| POST | `/api/auth/resend-otp` | no | Resend demo OTP |
| POST | `/api/auth/login` | no | Login with email/phone + password |
| GET | `/api/auth/me` | Bearer | Current user |

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
- `cases`
- `hearings`

Drizzle schema: `src/db/schema/index.ts`
