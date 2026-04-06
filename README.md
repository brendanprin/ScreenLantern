# ScreenLantern

ScreenLantern is a household streaming discovery app that reduces decision fatigue. It helps users search across movies and TV, see where a title is available, save and rate titles, and generate recommendations for a single person or a household combination.

The MVP is intentionally focused on discovery, library management, explainable recommendation logic, and practical handoff into a streaming service. Playback, direct per-streamer account linking, and AI chat are explicitly deferred.

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
- Streaming-service handoff with honest `Open in service` actions when ScreenLantern can build a reliable destination URL
- Trakt account linking with manual sync plus configurable sync freshness for personal watched history, ratings, and watchlist import
- Last-sync review in Settings with manual-versus-automatic labeling, recent import preview, and no-change/failure summaries
- Personal library actions: watchlist, watched, like, dislike, hide
- Solo recommendation mode
- Combined household recommendation mode
- Group watch-session modeling that stays distinct from solo watched history
- Recommendation cards with concise explanation reasons plus a lightweight “Why this?” disclosure
- Home resurfacing lanes for watchlist titles that are back on your radar or available now on your services
- In-app reminder center for newly available and resurfaced watchlist titles in the current solo or group context
- Reminder preferences for category toggles, solo/group tuning, resurfacing pace, and dismissed-reminder reappearance
- Context-aware Library decision workspace with smart sections, provider-aware badges, and quick triage actions
- Distinct shared watchlist planning for the active group or broader household
- Cross-user fit summary on title detail plus lightweight “who this is best for” card labels
- Household activity feed for shared planning, watched-together moments, invites, and governance changes
- Demo seed data for Brendan, Katie, Palmer, and Geoff

## MVP Release Focus

- Core loop:
  - Search or browse
  - Open a title detail page
  - Save or compare in the right context
  - Open in a streaming service
- Home, Library, and Title Detail are the primary decision surfaces in MVP.
- Search and Browse intentionally stay lighter-weight shortlist surfaces. They help users narrow candidates first, then move into detail for richer actions.
- Reminders and Activity are useful supporting surfaces, but they are intentionally secondary to the core discovery-to-handoff flow.

## Local Development

### Docker Compose development path

This is the fastest fully containerized path now:

```bash
cp .env.example .env
npm install
npm run docker:dev:up
```

What it does:

- starts an internal Postgres container for the dev stack
- starts the app on [http://localhost:3000](http://localhost:3000)
- waits for the database
- runs `prisma migrate deploy`
- generates the Prisma client
- seeds the full demo household once when the database is empty, including demo title interactions

Stop it with:

```bash
npm run docker:dev:down
```

### Manual local development path

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
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260403190000_user_reminders/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260403200000_user_reminder_preferences/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260403210000_shared_watchlist_entries/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260403223000_household_activity/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260404103000_trakt_connections/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260406113000_trakt_sync_freshness/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260406153000_trakt_sync_review/migration.sql
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

### Verified Development Commands

```bash
docker compose up -d
npm run db:generate
npm run db:seed
npm run dev
```

Containerized development path:

```bash
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.dev.yml up --build -d
```

Useful feature verification:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:e2e
```

## Local Production-Like Run

### Docker Compose production-like path

For a one-command production-like local run:

```bash
cp .env.example .env
npm install
npm run docker:prod:up
```

What it does:

- starts an isolated internal Postgres container for the prod-like stack
- builds the app image with `npm run build`
- starts the built app on [http://localhost:3001](http://localhost:3001)
- waits for the database
- runs `prisma migrate deploy`
- seeds demo users and household structure once when the production-like database is empty
- does not preload demo watch history, ratings, watchlist items, or provider preferences in the prod-like stack

Stop it with:

```bash
npm run docker:prod:down
```

### Manual production-like path

1. Use the same `.env` file and running PostgreSQL container as development mode.
2. Apply the checked-in SQL migrations if you have not already.
3. Regenerate Prisma and reseed if you want the demo household locally:

```bash
npm run db:generate
npm run db:seed
```

4. Build the app:

```bash
npm run build
```

5. Start the built app:

```bash
npm run start
```

Production-like local caveat:

- If you ran `npm run dev` after the last build, run `npm run build` again before `npm run start`. In local development, `.next` can contain dev artifacts after a later `next dev` session.
- The production compose path avoids that `.next` caveat by building inside the image before startup.

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
- `TRAKT_CLIENT_ID`: Trakt OAuth client id
- `TRAKT_CLIENT_SECRET`: Trakt OAuth client secret
- `TRAKT_REDIRECT_URI`: Trakt OAuth callback URL, defaults to `/api/integrations/trakt/callback`
- `TRAKT_USE_MOCK_DATA`: set `1` to force deterministic local Trakt mock sync data
- `INTERNAL_SYNC_SECRET`: optional secret for protected internal Trakt sync calls; falls back to `AUTH_SECRET` if omitted

Recommended local integration modes:

- Development and Playwright: `TMDB_USE_MOCK_DATA=1` and `TRAKT_USE_MOCK_DATA=1`
- Production-like local check with live catalog: `TMDB_USE_MOCK_DATA=0` plus a real `TMDB_API_KEY`
- Trakt live OAuth: set real `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`, and a matching `TRAKT_REDIRECT_URI`

## Release-Readiness Notes

- For a production-style release check, set `TMDB_API_KEY` and keep `TMDB_USE_MOCK_DATA=0`.
- If `TMDB_API_KEY` is missing, ScreenLantern falls back to the local mock catalog and surfaces that state in Settings so the failure mode is explicit.
- If Trakt OAuth credentials are missing, Settings keeps Trakt import controls visible but clearly unavailable instead of failing silently.
- Search and Browse cards are intentionally trimmed for MVP hardening. Richer save, fit, and handoff decisions belong on Title Detail, Home, and Library.
- Supported `Open in service` actions remain intentionally narrow and honest. Unsupported providers still show availability without a fake handoff button.
- Trakt import controls are intentionally title-level in MVP. Bulk import cleanup and richer conflict-resolution tooling remain post-MVP.
- Trakt Settings now keeps the last sync review compact and user-facing:
  - changed imports get a short summary plus a few recent imported titles
  - no-change syncs say so directly
  - failed syncs avoid raw internal error details and steer the user toward retrying or reconnecting

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

## Streaming-Service Handoff

- ScreenLantern adds `Open in service` actions on title detail and on Home/Library cards when a reliable handoff can be constructed.
- Handoff is derived from the existing provider-availability model and stays region-aware through `TMDB_WATCH_REGION`.
- MVP handoff states are intentionally explicit:
  - `openable`: availability is known and ScreenLantern can build a safe search-level provider URL
  - `availability_only`: availability is known, but ScreenLantern does not claim a reliable open action
  - `unknown`: provider availability itself is unavailable right now
- Current search-level handoff support is intentionally limited to providers with reliable public search URLs:
  - `Netflix`
  - `Hulu`
  - `Prime Video`
  - `Max`
  - `Apple TV` / `Apple TV Plus`
  - `Peacock`
- Other providers still show honest availability, but ScreenLantern avoids fake or broken `Open in ...` buttons when a trustworthy destination is not available.
- Selected-service prioritization uses the signed-in viewer's provider preferences:
  - matching services rank first
  - a single strong option becomes the primary `Open in ...` action
  - multiple openable services surface a `Choose service` affordance
- Detail pages show fallback copy like `Available on Disney Plus, but direct open is unavailable.`
- Cards stay quieter and only render handoff controls when a real openable destination exists.

## Trakt Sync

- ScreenLantern supports user-owned Trakt linking in Settings.
- The Trakt connection is personal to the signed-in ScreenLantern user and never becomes household-shared state.
- MVP import scope is intentionally narrow and explainable:
  - watched history imports into personal `WATCHED`
  - watchlist imports into personal `WATCHLIST`
  - ratings map into personal taste inputs:
    - `7-10` becomes `LIKE`
    - `1-4` becomes `DISLIKE`
    - `5-6` stays neutral
- Imported data is stored with an `IMPORTED` source context so sync can be idempotent and manual ScreenLantern actions can stay authoritative.
- ScreenLantern surfaces that source context in the personal places where it matters most:
  - Title Detail shows whether watched, watchlist, or taste state came from Trakt or from manual ScreenLantern actions
  - Library collection views can be filtered to `Imported from Trakt` or `Added in ScreenLantern` for the signed-in user's own profile
- Sync behavior stays deterministic and reuses one import path:
  - connect Trakt
  - run `Sync now` for the first import
  - later syncs, whether manual or automatic, only pull changed categories when Trakt activity timestamps indicate new work
- Sync freshness modes:
  - `Off`: manual sync only
  - `Daily`: after the first successful import, ScreenLantern can refresh once per day when the user returns
  - `On sign in or app open`: ScreenLantern can refresh more aggressively when the imported data is getting stale
- Settings includes a lightweight sync review so users can see:
  - whether the last sync was manual or automatic
  - whether it imported new watched, rating, or watchlist changes
  - when no Trakt changes were found
  - a few recently imported titles when the last sync made real changes
- Automatic freshness uses opportunistic triggers instead of a full job system:
  - protected app loads can call the same sync service through an authenticated auto-sync path
  - a protected internal route exists for future scheduler or cron use and is guarded by `INTERNAL_SYNC_SECRET`
  - repeated failures back off instead of retrying aggressively on every page load
- Imported title state can be cleared per title without disconnecting Trakt:
  - remove imported watched state
  - remove imported watchlist state
  - remove imported taste state derived from Trakt ratings
  - manual ScreenLantern actions on the same title stay intact
- Disconnecting Trakt removes the OAuth connection and tokens, but keeps already imported personal history and watchlist data in ScreenLantern unless the user clears or changes it manually.
- `TRAKT_USE_MOCK_DATA=1` enables deterministic mock Trakt data for local development and Playwright.

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
- Group resurfacing uses:
  - the union of personal watchlists from the selected members
  - titles intentionally saved for the exact active group
  - titles intentionally saved for the household
- Exact current-group watch history still suppresses stale shared rewatches.
- Shared watchlist entries are planning intent, not taste writes:
  - personal watchlists still belong to individual members
  - group-shared and household-shared saves stay separate from personal likes, dislikes, and watched history
- Provider freshness for resurfacing is on-demand:
  - fresh provider snapshots are reused from `TitleCache` when they are recent
  - stale watchlist items refresh provider availability when the Home feed is built
  - no background job or notification system is required in MVP
- The same resurfacing rules are intended to power future push or email notifications, but notification delivery itself is deferred.

## In-App Reminders

- ScreenLantern includes a dedicated `/app/reminders` inbox plus an unread badge in the protected app shell.
- Reminders are generated from the same watchlist resurfacing rules used on Home, not from a separate ranking engine.
- Reminder categories in MVP:
  - `available_now`
  - `watchlist_resurface`
  - `group_watch_candidate`
- Reminder records are stored per signed-in user and current recommendation context.
- Solo reminders reflect the active solo profile's watchlist and watched state.
- Group reminders reflect the active group context and suppress titles the exact group already watched together.
- Group reminders can reuse shared-save explanations such as:
  - `Saved for Brendan + Palmer`
  - `Saved by Katie for the household`
- Reminder freshness is on-demand:
  - shell badge loads and the reminders page refresh the current context's reminder set
  - existing provider freshness and title-cache rules are reused
  - no cron jobs, push delivery, or email delivery are required in MVP
- Reminder preferences are user-owned and currently support:
  - category toggles for `available_now`, `watchlist_resurface`, and `group_watch_candidate`
  - separate solo and group reminder toggles
  - reminder pace: `Light`, `Balanced`, or `Proactive`
  - optional dismissed-reminder reappearance after a fixed 14-day cooldown
- Reminder pacing is deterministic:
  - `Available now` remains the highest-value signal unless disabled
  - softer resurfacing reminders are capped based on the selected pace
  - `Light` keeps softer nudges minimal, `Balanced` allows a few, and `Proactive` allows more
- Dismissed reminder behavior is conservative:
  - dismissed reminders stay gone by default
  - if reappearance is enabled, the same dismissed reminder can return after 14 days if it still fits the current context
  - a newly higher-value `available_now` reminder can still surface as its own category unless that category is disabled
- Reminder actions currently support:
  - open title detail
  - mark read
  - dismiss

## Library Decision Workspace

- The Library now behaves as a decision workspace, not just a bucket list.
- It follows the active recommendation context:
  - solo mode uses the selected solo profile
  - group mode uses the active saved group or ad hoc member combination
- Smart Library sections in MVP include:
  - `Available now`
  - `Best from your watchlist` or `Good for this group`
  - `Shared for this group`
  - `Shared for household`
  - `Recently saved`
  - `Already watched`
  - `Hidden / not interested` or `Deprioritized for this group`
- Provider-aware treatment is intentionally explicit:
  - `Available now` means the title matches the selected services in the configured watch region
  - `Available elsewhere` means provider data exists, but not on the selected services
  - `Provider status unknown` means missing or incomplete provider data and is never treated as a positive signal
- Library controls stay lightweight:
  - focus filters: `All`, `Available now`, `Movies`, `Shows`, `Unwatched`
  - sort modes: `Smart`, `Recently saved`, `Shorter runtime`
- Quick triage actions depend on context:
  - solo sections allow `Watched by me`, watchlist toggle, like, dislike, and hide
  - group decision sections allow `Watched by current group` without mutating each participant's personal taste state
  - informational group sections such as watched-together history and deprioritized titles stay read-oriented to avoid ambiguous shared edits
- Exact current-group watch history suppresses stale “fresh pick” candidates so the room does not keep seeing titles it already watched together as new decisions.

## Shared Watchlist Planning

- ScreenLantern now models three separate save semantics:
  - personal watchlist: a `WATCHLIST` interaction owned by one user profile
  - group-shared save: a shared planning entry for the exact active group context
  - household-shared save: a shared planning entry for the whole household
- Shared saves record:
  - who saved the title
  - which context it was saved for
  - whether the scope is `GROUP` or `HOUSEHOLD`
- Shared saves do not automatically create:
  - personal watchlist rows
  - likes or dislikes
  - personal watched history
  - group watch sessions
- Title detail and Library surfaces make the distinction explicit with actions such as:
  - `Save for me`
  - `Save for current group`
  - `Save for household`
- Group and household shared entries can feed group resurfacing, reminders, and Library sections, but solo recommendations remain grounded in the active solo profile's personal state.

## Cross-User Fit and Title Transparency

- Title detail now includes a derived fit summary for the active context.
- Solo contexts can surface copy such as:
  - `Best fit for Brendan`
  - `Good fit for Katie`
- Group contexts can surface honest shared-language such as:
  - `Good shared fit for Brendan + Palmer`
  - `Safe compromise for Brendan + Palmer`
  - `Mixed fit for Brendan + Katie`
  - `Brendan + Palmer already watched this together`
- Household signal rows are derived from existing data:
  - personal interactions like watchlist, like, dislike, hide, and watched
  - group watch-session participation
  - shared watchlist saves for the active group or household
  - existing solo recommendation heuristics for “likes similar picks” style fit
- Fit summaries are intentionally derived, not persisted in a new table.
- Home and Library cards can also show a lightweight fit label such as:
  - `Best for Katie`
  - `Strong shared fit`
  - `Shared planning pick`
- This keeps “who this is best for?” legible without exposing raw score math or building a full analytics dashboard.

## Household Activity Feed

- ScreenLantern now includes a dedicated `/app/activity` page in the protected shell.
- The activity feed is household-scoped and intentionally limited to explicitly shared events:
  - shared saves for the active group
  - shared saves for the household
  - shared-save removals
  - watched-by-current-group events
  - invite creation, revocation, and redemption
  - ownership transfer
  - member removal
- Activity events are emitted from the existing shared-watchlist, group-watch, invite, and governance flows instead of from a separate logging system.
- Personal-only actions such as private watchlist saves, likes, dislikes, hides, and solo watched history do not appear in the household feed.
- Activity items store:
  - household
  - actor
  - event type
  - timestamp
  - optional title reference
  - optional context label
  - summary and detail copy for rendering
- Title-linked activity items include an `Open ...` link back to the detail page.
- Feed reads are authorized server-side against the signed-in user's current household, so cross-household activity never leaks.
- The feed is designed as collaborative history, not a full audit log, so it stays concise and human-readable.

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
- `npm run docker:dev:up`: build and start the containerized development stack
- `npm run docker:dev:down`: stop the containerized development stack
- `npm run docker:prod:up`: build and start the production-like container stack
- `npm run docker:prod:down`: stop the production-like container stack
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

- More aggressive resurfacing surfaces or notification delivery beyond the current in-app reminder center
- Password reset and email verification
- OAuth providers
- Invite email delivery and reusable invite policies
- Multi-owner management and owner-to-owner removal flows
- Background metadata refresh jobs and richer cache invalidation
- Cross-region provider reconciliation beyond the configured watch region
- Group watch-session editing, undo, and richer shared-history UI
- Activity reactions, comments, per-title discussion threads, and richer activity filtering
- Streaming-service account linking, entitlement checks, and sync
- Broader provider deep-link coverage beyond the currently supported search-level handoff providers
- Deep recommendation-debug views and richer explanation timelines
- Push, email, or cron-based “now available” notifications
- Advanced faceted Library search, bulk cleanup workflows, and deeper reminder-rule tuning
- Custom per-category cooldown windows and more advanced reminder frequency rules
- Comments, reactions, and richer collaboration feeds on shared watchlist entries
- AI chat and LLM orchestration
- Native mobile clients
