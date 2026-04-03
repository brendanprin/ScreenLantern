# ScreenLantern

ScreenLantern is a household streaming discovery app that reduces decision fatigue. It helps users search across movies and TV, see where a title is available, save and rate titles, and generate recommendations for a single person or a household combination.

The MVP is intentionally focused on discovery, library management, and explainable recommendation logic. Playback, deep streaming integrations, and AI chat are explicitly deferred.

## Stack

- Next.js App Router
- TypeScript
- Prisma + PostgreSQL
- Auth.js credentials authentication
- Tailwind CSS with shadcn/ui-style component primitives
- TMDb catalog integration with mock-data fallback
- Playwright smoke tests
- Vitest unit tests

## MVP Features

- Email/password sign up, sign in, sign out, and protected app routes
- Household-oriented user model with saved recommendation groups
- Search and browse flows across movies and TV
- Title detail pages with metadata and provider availability
- Personal library actions: watchlist, watched, like, dislike, hide
- Solo recommendation mode
- Combined household recommendation mode
- Demo seed data for Brendan, Katie, Palmer, and Geoff

## Local Setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Install dependencies:

```bash
npm install
```

4. Apply the checked-in initial migration:

```bash
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260403130200_init/migration.sql
```

5. Generate the Prisma client:

```bash
npm run db:generate
```

6. Seed demo data:

```bash
npm run db:seed
```

7. Start the app:

```bash
npm run dev
```

8. Open [http://localhost:3000](http://localhost:3000).

## Demo Credentials

- Brendan: `brendan@screenlantern.demo`
- Katie: `katie@screenlantern.demo`
- Palmer: `palmer@screenlantern.demo`
- Geoff: `geoff@screenlantern.demo`
- Shared password: `screenlantern-demo`

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `AUTH_SECRET`: long random secret used by Auth.js
- `AUTH_TRUST_HOST`: set to `true` for local dev
- `NEXTAUTH_URL`: base URL for auth callbacks
- `TMDB_API_KEY`: TMDb API key for live metadata
- `TMDB_WATCH_REGION`: provider lookup region, default `US`
- `TMDB_USE_MOCK_DATA`: set `1` to force local mock catalog usage

## Scripts

- `npm run dev`: start the app locally
- `npm run build`: production build
- `npm run lint`: lint the codebase
- `npm run test:unit`: run Vitest unit tests
- `npm run test:e2e`: run Playwright smoke tests
- `npm run db:migrate`: Prisma migration workflow if your local Prisma engine is healthy
- `npm run db:seed`: seed demo household data

## Docs

- [Product spec](/Users/brendanprin/workspace/personal/ScreenLantern/docs/product-spec.md)
- [Architecture](/Users/brendanprin/workspace/personal/ScreenLantern/docs/architecture.md)
- [MVP scope](/Users/brendanprin/workspace/personal/ScreenLantern/docs/mvp-scope.md)
- [Roadmap](/Users/brendanprin/workspace/personal/ScreenLantern/docs/roadmap.md)
- [Data model](/Users/brendanprin/workspace/personal/ScreenLantern/docs/data-model.md)
- [Epics and tickets](/Users/brendanprin/workspace/personal/ScreenLantern/docs/planning/epics-and-tickets.md)

## Deferred For Post-MVP

- Password reset and email verification
- OAuth providers
- Streaming service sync
- Rich recommendation explanations in UI
- AI chat and LLM orchestration
- Native mobile clients
