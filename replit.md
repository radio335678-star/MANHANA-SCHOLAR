# MANTHANA-SCHOLER

AI-powered thesis and research writing platform for Indian medical scholars across Allopathy, Ayurveda, Homeopathy, Siddha, and Unani.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/web run dev` — run the React frontend (port 22333)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- Optional env: `KIMI_API_KEY` or `MOONSHOT_API_KEY` — Moonshot AI (kimi-k2) for AI writing features

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Clerk Auth (`@clerk/express`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: Moonshot AI (Kimi) via OpenAI-compatible SDK — proxied server-side
- API codegen: Orval (from OpenAPI spec)
- Frontend: React + Vite, Wouter, TanStack Query, shadcn/ui, Tailwind v4
- Auth: Replit-managed Clerk (Clerk proxy middleware wired in `app.ts`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema files (one per table)
- `artifacts/api-server/src/routes/` — Express route handlers (reference, profile, dashboard, workspaces, sections, chat, vault)
- `artifacts/api-server/src/lib/kimi.ts` — Kimi AI proxy (lazy client, graceful fallback when key missing)
- `artifacts/api-server/src/lib/auth.ts` — Clerk auth helpers (`requireAuth`, `getClerkUserId`, `getOrCreateDbUser`)
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — Clerk FAPI proxy
- `artifacts/web/src/pages/` — React pages (landing, auth, onboarding, dashboard, workspaces, editor, vault, profile)
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — auto-generated Zod schemas (do not edit)

## Architecture decisions

- **Contract-first OpenAPI**: All API contracts defined in `openapi.yaml` before implementation; codegen produces typed hooks and Zod validators
- **Clerk proxy pattern**: The API server proxies Clerk FAPI requests through `/api/__clerk` so auth works on custom domains and `.replit.app` without CNAME DNS
- **AI never exposed client-side**: Kimi/Moonshot API key only exists server-side; all AI calls proxied through Express routes
- **Lazy AI client**: OpenAI-compatible client initialized only on first AI call so server starts without the key in development
- **Reference data seeded at deploy**: Domains, qualifications, Indian medical colleges/universities seeded via `executeSql` — no seed migrations needed

## Product

- **Landing page** — Marketing landing with hero, features, CTAs
- **Auth** — Clerk-powered sign-in/sign-up with custom branded screens
- **Onboarding** — Collects scholar profile (domain, qualification, college, university, guide)
- **Dashboard** — Stats overview, recent activity feed, recent workspaces
- **Workspaces** — Thesis project management (create, filter by status active/completed/archived)
- **Section Editor** — 3-pane editor: section list + rich text editor + AI chat assistant
- **Research Vault** — Per-workspace library for papers, notes, references, links, images
- **Profile** — Scholar identity management

## User preferences

- No emojis anywhere in the UI
- Medical Blue-White modern clinic theme: deep navy `#1D4ED8`, clinical white `#F8FAFC`, saffron accent `#F59E0B`
- Scholarly typography: Playfair Display (headings) + Inter (body)
- Production quality, no MVP shortcuts
- Indian medical context: covers all 5 recognized systems (Allopathy, Ayurveda, Homeopathy, Siddha, Unani)

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml` — the typecheck:libs step is included
- Body schema names in OpenAPI must be entity-shaped (`SectionInput`), never operation-shaped (`CreateSectionBody`) — avoids TS2308 collisions
- Operations with BOTH path params AND query params cause Orval `Params` type collisions — remove query params from such endpoints
- The Clerk proxy middleware must be mounted BEFORE `express.json()` (streams raw bytes)
- `@workspace/db` tables are available as named exports — run `pnpm run typecheck:libs` if TS can't find them after schema changes

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Kimi AI (Moonshot) endpoint: `https://api.moonshot.ai/v1`, default model: `moonshot-v1-8k`
