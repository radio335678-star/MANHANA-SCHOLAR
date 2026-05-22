# Production deploy: Vercel + Render + Supabase

Deploy order: **Render (API) → update `vercel.json` → Vercel (web) → Supabase Auth URLs**.

## 1. GitHub

Repo: https://github.com/radio335678-star/MANHANA-SCHOLAR

Never commit `.env`. Copy secrets from your local `.env` into Render/Vercel dashboards only.

## 2. Render (API only)

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint** (or **Web Service**).
2. Connect GitHub repo `MANHANA-SCHOLAR` — config is in [`render.yaml`](render.yaml).
3. **Region:** Singapore (closest to Supabase Mumbai).
4. **Plan:** Free for testing (sleeps after 15 min idle); **Starter ($7/mo)** for always-on + better SSE.
5. **Environment variables** — copy from [`render.env.example`](render.env.example):

| Variable | Value |
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
| `DATASET_AGENT_TIMEOUT_MS` | `600000` (optional — default is 600000; raise to `900000` if large master charts still time out) |

Do **not** set `VITE_*` on Render. Render sets `PORT` automatically.

6. After deploy, copy the public URL (e.g. `https://manthana-scholar-api.onrender.com`).
7. Verify:

```bash
curl https://YOUR-RENDER-HOST.onrender.com/api/healthz
curl https://YOUR-RENDER-HOST.onrender.com/api/healthz/ready
```

## 3. Vercel (frontend + API proxy)

**Import:** https://vercel.com/new?repository=https://github.com/radio335678-star/MANHANA-SCHOLAR

1. Root directory: `/`. Settings in [`vercel.json`](vercel.json).
2. **Edit `vercel.json`:** replace `REPLACE_WITH_YOUR_RENDER_HOST` with your Render hostname (e.g. `manthana-scholar-api.onrender.com`, no `https://`).
3. **Environment variables** (Production + Preview):

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://lziejvvfmreprdnuifwx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

**Redeploy Vercel** after changing `VITE_*` (baked in at build time).

Use the **legacy anon JWT** (`eyJ...`) for `VITE_SUPABASE_ANON_KEY`, not `sb_publishable_`.

If sign-in returns HTTP 400 / “Invalid login credentials”, reset the user password via Admin API (local `.env` with service role):

```bash
pnpm supabase:reset-password your@email.com 'YourNewPassword'
```

4. Optional on Render: `CORS_ALLOWED_ORIGINS=https://manhana-scholar.vercel.app`

## 4. Supabase Auth URLs

[Auth URL configuration](https://supabase.com/dashboard/project/lziejvvfmreprdnuifwx/auth/url-configuration):

| Field | Value |
|-------|--------|
| Site URL | `https://manhana-scholar.vercel.app` |
| Redirect URLs | `https://manhana-scholar.vercel.app/**`, `http://localhost:22333/**` |

## 5. Smoke test

```bash
pnpm deploy:smoke https://YOUR-RENDER-HOST.onrender.com
pnpm deploy:smoke https://manhana-scholar.vercel.app
```

## What runs where

| Component | Platform |
|-----------|----------|
| React SPA | Vercel |
| `/api/*` (proxied) | Vercel → Render |
| Express API | Render (Singapore) |
| Postgres, Auth, Storage | Supabase (Mumbai) |
| Kimi AI | Moonshot (via Render env) |
