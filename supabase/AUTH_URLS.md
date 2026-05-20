# Supabase Auth URL configuration (production)

## Direct email/password sign-in (no confirmation email)

**Dashboard → Authentication → Providers → Email:**

- Enable **Email** provider
- Turn **OFF** “Confirm email” so `signInWithPassword` / `signUp` return a session immediately (matches `supabase/config.toml` → `enable_confirmations = false`)

## Redirect URLs

After Vercel deploy, update:

**Dashboard:** https://supabase.com/dashboard/project/lziejvvfmreprdnuifwx/auth/url-configuration

| Field | Value |
|-------|--------|
| **Site URL** | `https://YOUR-APP.vercel.app` |
| **Redirect URLs** | `https://YOUR-APP.vercel.app/**` |
| | `http://localhost:22333/**` |

Replace `YOUR-APP.vercel.app` with your actual Vercel production hostname.
