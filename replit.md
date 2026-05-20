# MANTHANA-SCHOLER

AI-powered thesis and research writing platform for Indian medical scholars across Allopathy, Ayurveda, Homeopathy, Siddha, and Unani.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/web run dev` — run the React frontend (port 22333)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm supabase:push` — apply `supabase/migrations/` to the linked Supabase project
- `pnpm --filter @workspace/db run seed` — seed reference data (requires `DATABASE_URL`)

### Required env

- `DATABASE_URL` — Supabase Postgres pooler URL
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — frontend auth
- `KIMI_API_KEY` or `MOONSHOT_API_KEY` — Moonshot AI for writing features

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Auth & DB**: Supabase (Auth, Postgres, Storage, Realtime)
- API: Express 5 + JWT validation via Supabase
- Data access: `@workspace/db` → Supabase Postgres
- Validation: Zod, OpenAPI codegen (Orval)
- AI: Moonshot (Kimi) via OpenAI-compatible SDK — server-side only
- Frontend: React + Vite, Wouter, TanStack Query, shadcn/ui, Tailwind v4

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (single source of truth)
- `supabase/migrations/` — database schema, RLS, storage policies
- `lib/db/src/schema/` — TypeScript table definitions (maps to Supabase Postgres)
- `artifacts/api-server/src/routes/` — Express handlers
- `artifacts/api-server/src/lib/auth.ts` — Supabase JWT auth (`requireAuth`, `requireDbUser`)
- `artifacts/web/src/lib/supabaseClient.ts` — browser Supabase client
- `artifacts/web/src/lib/auth.tsx` — session provider + API token wiring

## Architecture decisions

- **Contract-first OpenAPI**: Types and Zod validators generated from `openapi.yaml`
- **Supabase-only auth**: No third-party auth providers; `supabase_user_id` links `auth.users` to `public.users`
- **AI never client-side**: Kimi key only on the API server
- **Schema changes**: Edit SQL under `supabase/migrations/`, then `pnpm supabase:push` or Supabase MCP `apply_migration`

## Product

- Landing, sign-in/sign-up (Supabase), onboarding, dashboard, workspaces, section editor, research vault, profile

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Body schema names must be entity-shaped (`SectionInput`), not operation-shaped
- Web `artifacts/web/.env` needs `PORT=22333` and `BASE_PATH=/` for Vite
- API uses `API_PORT` or `PORT` (default via root `.env`)

## Pointers

- Supabase dashboard: project ref `lziejvvfmreprdnuifwx`
- Kimi endpoint: `https://api.moonshot.cn/v1`, model `moonshot-v1-8k`
