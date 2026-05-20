# Production deploy: Vercel + Railway + Supabase

Deploy order: **Railway (API) → update `vercel.json` → Vercel (web) → Supabase Auth URLs**.

## 1. GitHub

Push this repo (`Web-Scholar-Search` root) to GitHub. Connect the same repo to Railway and Vercel.

```powershell
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Never commit `.env`. Copy secrets from your local `.env` into platform dashboards only.

## 2. Railway (API only)

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub → select this repo.
2. Root directory: `/` (repo root). Config is in [`railway.toml`](railway.toml).
3. **Variables** (Settings → Variables):

| Variable | Where |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase pooler URL (port 6543) |
| `SUPABASE_URL` | `https://lziejvvfmreprdnuifwx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (secret) |
| `SUPABASE_STORAGE_BUCKET` | `thesis-artifacts` |
| `KIMI_API_KEY` | Moonshot dashboard |
| `KIMI_BASE_URL` | `https://api.moonshot.ai/v1` |
| `MOONSHOT_WEB_SEARCH` | `true` |
| `KIMI_PRIMARY_MODEL` | `kimi-k2.6` |
| `KIMI_FALLBACK_MODELS` | `kimi-k2.5` |

Do **not** set `VITE_*` on Railway. Railway sets `PORT` automatically.

4. After deploy, copy the public URL (e.g. `https://manthana-api-production.up.railway.app`).
5. Verify:

```bash
curl https://YOUR-RAILWAY-HOST/api/healthz
curl https://YOUR-RAILWAY-HOST/api/healthz/ready
```

## 3. Vercel (frontend + API proxy)

**One-click import (team: shivakuma-s-projects):**

https://vercel.com/new?repository=https://github.com/radio335678-star/MANHANA-SCHOLAR&teamSlug=shivakuma-s-projects

1. Click **Continue with GitHub** and authorize if prompted.
2. Confirm build settings (auto-read from [`vercel.json`](vercel.json)).
2. Root directory: `/`. Settings are in [`vercel.json`](vercel.json).
3. **Before first deploy**: edit `vercel.json` and replace `REPLACE_WITH_YOUR_RAILWAY_HOST` with your Railway hostname (no `https://`, e.g. `manthana-api-production.up.railway.app`).
4. **Environment variables** (Project → Settings → Environment Variables) — **required for Production and Preview**:

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://lziejvvfmreprdnuifwx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → **anon** `public` key |

**Important:** Vite bakes `VITE_*` into the JS at **build time**. After adding or changing these, click **Redeploy** (a blank white page usually means `VITE_SUPABASE_ANON_KEY` was missing during build).

5. Deploy. Optional: set `CORS_ALLOWED_ORIGINS=https://YOUR-APP.vercel.app` on Railway if you call the API directly.

## 4. Supabase Auth URLs

[Auth URL configuration](https://supabase.com/dashboard/project/lziejvvfmreprdnuifwx/auth/url-configuration):

| Field | Value |
|-------|--------|
| Site URL | `https://YOUR-APP.vercel.app` |
| Redirect URLs | `https://YOUR-APP.vercel.app/**`, `http://localhost:22333/**` |

## 5. Smoke test

**Automated API checks** (after Railway or Vercel deploy):

```bash
pnpm deploy:smoke https://YOUR-RAILWAY-HOST.up.railway.app
# or via Vercel proxy:
pnpm deploy:smoke https://YOUR-APP.vercel.app
```

**Manual UI checks:**

1. Landing page on Vercel URL  
2. Sign up / sign in  
3. Dashboard and onboarding  
4. Workspace → editor → chat (streaming)  
5. Vault upload  
6. DOCX export  

Local API build verified: `/api/healthz/ready` returns `database`, `supabaseStorage`, and `supabaseAuth` all `true`.

## What runs where

| Component | Platform |
|-----------|----------|
| React SPA | Vercel |
| `/api/*` (proxied) | Vercel → Railway |
| Express API | Railway |
| Postgres, Auth, Storage | Supabase |
| Kimi AI | Moonshot (via Railway env) |
