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
- Household-oriented user model with owner/member roles, invites, and saved recommendation groups
- Owner transfer flow plus clearer household governance controls
- Server-persisted active recommendation context that restores across sessions and devices
- Search and browse flows across movies and TV
- Title detail pages with metadata and provider availability
- Personal library actions: watchlist, watched, like, dislike, hide
- Solo recommendation mode
- Combined household recommendation mode
- Group watch-session modeling that stays distinct from solo watched history
- Recommendation cards with concise explanation reasons plus a lightweight “Why this?” disclosure
- Home resurfacing lanes for watchlist titles that are back on your radar or available now on your services
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

4. Apply the checked-in migrations:

```bash
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260403130200_init/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260403153000_household_roles_and_invites/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260403170000_recommendation_context_and_group_watch_sessions/migration.sql
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

## Demo Invite

- Invite code: `LANTERNJOIN`
- Invite link: `http://localhost:3000/sign-up?invite=LANTERNJOIN`

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `AUTH_SECRET`: long random secret used by Auth.js
- `AUTH_TRUST_HOST`: set to `true` for local dev
- `NEXTAUTH_URL`: base URL for auth callbacks
- `TMDB_API_KEY`: TMDb API key for live metadata
- `TMDB_WATCH_REGION`: provider lookup region, default `US`
- `TMDB_USE_MOCK_DATA`: set `1` to force local mock catalog usage

## TMDb Live Mode

- `TMDB_USE_MOCK_DATA=1` forces the local mock catalog for development and Playwright runs.
- When `TMDB_USE_MOCK_DATA=0` and `TMDB_API_KEY` is present, ScreenLantern uses live TMDb search, discover, detail, genre, and watch-provider endpoints.
- Movie and TV discover filters are mapped honestly:
  - movies use `primary_release_year`
  - series use `first_air_date_year`
  - runtime filtering applies to movie runtime for films and episode runtime for series
- Provider handling is resilient by design:
  - provider catalogs are cached in memory for 24 hours
  - per-title provider availability is reused from `TitleCache` when recently synced and also memoized in memory for 12 hours
  - provider status distinguishes `available`, `unavailable`, and `unknown`
- When TMDb is unavailable, ScreenLantern shows friendly notices and empty states instead of crashing app routes.

## Recommendation Context and Group Watching

- ScreenLantern persists the active recommendation context per signed-in user on the server.
- Solo context can point at any valid household member profile in MVP.
- Group context can point at a saved household group or an ad hoc household combination.
- Invalid or stale saved contexts fall back safely to the viewer's solo profile.
- `WATCHED` in personal library remains a personal interaction.
- “Watched by current group” creates a separate group watch-session record and does not automatically write personal `WATCHED` interactions for every participant.
- Recommendation results now include structured explanations with:
  - a category for service-layer reuse
  - a short summary shown on the card
  - an optional detail shown behind the “Why this?” disclosure
- Solo explanations lean on personal taste, providers, runtime, and watch history.
- Group explanations emphasize safe overlap, shared-provider practicality, and whether the exact group has already watched a title together.

## Watchlist Resurfacing

- Home can resurface watchlist titles in lightweight lanes such as:
  - `Available now on your services`
  - `Back on your radar`
- “Available now” only applies when:
  - provider data is currently known
  - the title is available in the configured `TMDB_WATCH_REGION`
  - at least one provider matches the selected profile or active group's preferred services
- Titles with provider data marked `unknown` are never treated as “available now.”
- Solo resurfacing uses the active solo profile's watchlist and watched history.
- Group resurfacing uses the union of watchlists from the selected members, but suppresses titles the exact active group already watched together.
- Group resurfacing does not create a shared household watchlist. Saved titles still belong to the individual members who added them.
- Provider freshness for resurfacing is on-demand:
  - fresh provider snapshots are reused from `TitleCache` when they are recent
  - stale watchlist items refresh provider availability when the Home feed is built
  - no background job or notification system is required in MVP
- The same resurfacing rules are intended to power future push or email notifications, but notification delivery itself is deferred.

## Household Governance

- Households use a simple MVP+ role model: exactly one `OWNER` plus any number of `MEMBER`s.
- The current owner can create and revoke invites, transfer ownership to another member, and remove members.
- Ownership transfer demotes the prior owner to `MEMBER` and promotes the selected member to `OWNER`.
- Invite visibility stays household-scoped after a transfer, and the new owner can still manage invites created by the prior owner.
- If a member is removed, ScreenLantern moves that user into a new solo household instead of deleting the account.
- Current user and role information is re-read from the database on protected requests so governance changes show up immediately without requiring a fresh login.

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
- Invite email delivery and reusable invite policies
- Multi-owner management and owner-to-owner removal flows
- Background metadata refresh jobs and richer cache invalidation
- Cross-region provider reconciliation beyond the configured watch region
- Group watch-session editing, undo, and richer shared-history UI
- Streaming service sync
- Deep recommendation-debug views and richer explanation timelines
- Push, email, or cron-based “now available” notifications
- AI chat and LLM orchestration
- Native mobile clients
