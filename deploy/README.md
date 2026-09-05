# Deploy Court Files API to EC2

This repo deploys to its **own** EC2 instance via GitHub Actions.

## Architecture

```
GitHub Actions (build) → rsync over SSH → EC2
                              ↓
                    /var/www/court-files-server
                              ↓
                    PM2 (Node on :5500)
                              ↓
                    Nginx (:80/:443) → proxy /api
```

## One-time EC2 setup

1. Launch Ubuntu 22.04/24.04 EC2 (t3.small or larger recommended).
2. Security group inbound: **22** (your IP), **80**, **443**.
3. SSH in and clone or copy this repo once, then:

```bash
cd court_files_server
bash deploy/ec2-setup.sh
```

4. Create production env (never commit this):

```bash
nano /var/www/court-files-server/.env
```

Required (see `.env.example`):

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | `5500` |
| `JWT_SECRET` | 32+ random chars |
| `CORS_ORIGIN` | Frontend origin, e.g. `https://app.yourdomain.com` |
| `FRONTEND_URL` | Same as frontend origin |
| `API_PUBLIC_URL` | Public API URL, e.g. `https://api.yourdomain.com` |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Supabase |
| `DATABASE_URL` | Pooler URI (port 6543) |
| SMTP_* | Password reset / verify email |
| EasyPaisa vars | Optional until payments go live |

5. Copy PM2 config onto the server (first deploy also syncs it from CI if you include it — see workflow). For first boot:

```bash
# After first successful Actions deploy, or scp ecosystem.config.cjs manually:
cd /var/www/court-files-server
pm2 start ecosystem.config.cjs --env production
pm2 save
```

6. Edit Nginx `server_name`, then Certbot for HTTPS.

## GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Example |
|--------|---------|
| `EC2_HOST` | `54.x.x.x` or `api.yourdomain.com` |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Full private key PEM (including `BEGIN`/`END` lines) |
| `EC2_APP_DIR` | Optional; default `/var/www/court-files-server` |

### SSH key

```bash
# On your machine
ssh-keygen -t ed25519 -C "github-actions-court-api" -f court-api-deploy -N ""
# Public key → EC2 ~/.ssh/authorized_keys
# Private key → GitHub secret EC2_SSH_KEY
```

## Workflow

File: `.github/workflows/deploy-ec2.yml`

- Triggers on push to `master` / `main`, or manual **Run workflow**
- Builds TypeScript on GitHub
- Syncs `dist/`, `package.json`, `package-lock.json`, `drizzle/`
- On server: `npm ci --omit=dev` + `pm2 startOrReload`

## Manual deploy (without Actions)

```bash
npm ci && npm run build
rsync -az --delete -e "ssh -i your.pem" \
  --exclude node_modules --exclude .env --exclude .git \
  dist package.json package-lock.json ecosystem.config.cjs drizzle \
  ubuntu@EC2_HOST:/var/www/court-files-server/
ssh -i your.pem ubuntu@EC2_HOST \
  'cd /var/www/court-files-server && npm ci --omit=dev && pm2 startOrReload ecosystem.config.cjs --env production && pm2 save'
```

## Health check

```bash
curl -s https://api.yourdomain.com/api/health
# {"ok":true,"service":"court-files-server"}
```

## Notes

- `.env` is **never** uploaded by CI — manage it only on the instance.
- Run DB schema updates separately: `npm run db:sync` from a secure machine with `DATABASE_URL`, or apply SQL in Supabase.
- Keep `CORS_ORIGIN` and frontend `REACT_APP_API_URL` pointing at this API host.
