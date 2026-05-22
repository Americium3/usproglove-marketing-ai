**Language:** **English** · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md)

# USProGlove Marketing AI

Next.js + Drizzle (PostgreSQL with pgvector) + Vercel AI Gateway. Admin dashboard for outbound campaigns, a buy-side sourcing pipeline, and an internal knowledge base with semantic retrieval.

## Local setup

### 0. Prerequisites

- Node.js 20+ (recommend `nvm`)
- `pnpm` (`npm i -g pnpm`)
- PostgreSQL 16+ with the **`pgvector` extension installed** (required by the knowledge base)
  - Managed Postgres (Neon, Supabase, etc.) usually ships with it
  - Self-hosted: `CREATE EXTENSION IF NOT EXISTS vector;`

### 1. Clone & install

```bash
git clone https://github.com/Americium3/usproglove-marketing-ai.git
cd usproglove-marketing-ai
pnpm install
```

### 2. Configure environment variables

Create `.env.local` in the repo root. Ask the account owner for the full list (Auth0, Brevo, Hunter, Snov, Google Places, AI Gateway, etc.). At minimum:

```
DATABASE_URL=postgres://...           # must be a pgvector-capable Postgres
AI_GATEWAY_API_KEY=...                # Vercel AI Gateway, for embeddings and LLMs
AUTH0_SECRET=...
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
ADMIN_EMAILS=your@email.com           # comma-separated, controls access to /dashboard
```

### 3. **Run database migrations** (required on first setup, and after any schema change)

```bash
pnpm db:migrate
```

Reads `DATABASE_URL` from `.env.local` and applies every SQL file under `drizzle/`. On a fresh database this creates all tables, including `knowledge_sources` / `knowledge_chunks` plus the HNSW vector index.

Notes:

- If `pgvector` is not installed, the migration will fail when creating the `vector(1536)` column — run `CREATE EXTENSION vector;` first.
- After editing `src/lib/db/schema.ts`, run `pnpm db:generate` to produce a new migration file, then `pnpm db:migrate` to apply it.
- `pnpm db:studio` opens a GUI for browsing the database.

### 4. Start the dev server

```bash
pnpm dev
```

Open http://localhost:3000 and sign in via Auth0 with an address listed in `ADMIN_EMAILS` to reach `/dashboard`.

### 5. (Optional) Seed sample data

```bash
pnpm seed:campaign       # one example outbound campaign
pnpm seed:buyside        # buy-side RFQ pipeline sample
```

## Common scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations to the database |
| `pnpm db:push` | (Use with caution) push schema directly, bypassing migration files |
| `pnpm db:studio` | Open the drizzle-kit visual DB browser |

## Deploying to Vercel

- Connect the repo to Vercel; configure each environment variable in the Vercel project settings (mirroring `.env.local`).
- Every push triggers a build.
- For production migrations, run `pnpm db:migrate` against the production `DATABASE_URL` manually, or wire it into a GitHub Actions job.
