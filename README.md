# ScreenLantern

ScreenLantern is a household streaming discovery app that reduces decision fatigue. It helps users search across movies and TV, see where a title is available, save and rate titles, generate recommendations for a single person or a household combination, and ask a grounded recommendation assistant what to watch next.

The current product is intentionally focused on discovery, library management, explainable recommendation logic, a narrow AI recommendation assistant, and practical handoff into a streaming service. Playback remains deferred, but local Netflix history sync can now feed watched state into ScreenLantern without a manual CSV upload.

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
- Streaming-service handoff with honest `Open in ...`, `Search in ...`, or availability-only behavior based on the provider strategy ScreenLantern can actually support
- Trakt account linking with manual sync plus configurable sync freshness for personal watched history, ratings, and watchlist import
- Optional local Netflix viewing-history sync helper that can automate the official Netflix viewing-activity CSV export and import watched titles into ScreenLantern
- Last-sync review in Settings with manual-versus-automatic labeling, recent import preview, and no-change/failure summaries
- Personal library actions: watchlist, watched, like, dislike, hide
- Solo recommendation mode
- Combined household recommendation mode
- Group watch-session modeling that stays distinct from solo watched history
- Recommendation scoring that uses imported Trakt/Netflix history with reduced weight versus manual ScreenLantern actions
- Recency-aware taste profile: recent interactions shape recommendations more than old history
- Tiered watched suppression: recently watched titles are strongly held back, imported history is moderately suppressed, manual watched is lightly penalized for rewatch potential
- Watchlist items included in the main recommendation candidate pool alongside TMDb catalog results
- Recommendation cards with concise explanation reasons plus a lightweight “Why this?” disclosure
- Explanation language that distinguishes recently watched, imported history, and manually marked watched
- AI recommendation assistant page with one active thread per signed-in user, active solo/group context labeling, a persisted current ask, structured result cards, and grounded follow-up refinement memory
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
  - Hand off into a streaming service
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

If you want a one-command local standup that also runs Netflix sync when setup has already been completed, use:

```bash
npm run docker:dev:standup
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
npx prisma migrate deploy
```

If Prisma's schema engine fails locally during `migrate deploy`, apply the checked-in SQL migrations directly:

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
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260406203000_netflix_import_source/migration.sql
docker compose exec -T db psql -U postgres -d screenlantern < prisma/migrations/20260407131500_assistant_thread_state_v2/migration.sql
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
npm run lint
npm run test:unit
npm run test:e2e
npx playwright test tests/smoke.spec.ts --grep "assistant"
```

TypeScript verification caveat:

- `npx tsc --noEmit` depends on generated `.next/types` because `tsconfig.json` includes `.next/types/**/*.ts`.
- Run `npm run build` first, or start `npm run dev` once, before using standalone `tsc`.

## Local Production-Like Run

### Docker Compose production-like path

For a one-command production-like local run:

```bash
cp .env.example .env
npm install
npm run docker:prod:up
```

If you want a one-command production-like standup that also runs Netflix sync after the app is ready, use:

```bash
npm run docker:prod:standup
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
   Preferred path:

```bash
npx prisma migrate deploy
```

   If Prisma's schema engine fails locally, use the checked-in SQL migration commands from the manual development path above.

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
PORT=3001 npm run start
```

Production-like local caveat:

- If you ran `npm run dev` after the last build, run `npm run build` again before `npm run start`. In local development, `.next` can contain dev artifacts after a later `next dev` session.
- Keep `NEXTAUTH_URL` and any live Trakt redirect URI on the same port you use for manual production-like startup.
- The production compose path avoids that `.next` caveat by building inside the image before startup.
- The production-like Docker stack seeds demo users and household structure only. Personal watched, ratings, watchlist, and provider preferences should come from live TMDb plus Trakt sync, not from demo title interactions.

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
- `AI_PROVIDER`: assistant model provider, `openai` or `ollama`, defaults to `openai`
- `AI_BASE_URL`: optional custom chat-completions base URL; defaults to `https://api.openai.com/v1` for OpenAI and `http://localhost:11434/v1` for Ollama
- `AI_API_KEY`: generic assistant API key override
- `AI_MODEL`: assistant chat model, defaults to `gpt-5.4-mini` for OpenAI and `llama3.2` for Ollama
- `OPENAI_API_KEY`: OpenAI API key for the recommendation assistant; also works as a backward-compatible fallback for `AI_API_KEY`
- `OPENAI_MODEL`: backward-compatible fallback for `AI_MODEL`
- `AI_USE_MOCK_DATA`: set `1` to force deterministic local mock assistant behavior
- `TMDB_API_KEY`: TMDb API key for live metadata
- `TMDB_WATCH_REGION`: provider lookup region, default `US`
- `TMDB_USE_MOCK_DATA`: set `1` to force local mock catalog usage
- `TRAKT_CLIENT_ID`: Trakt OAuth client id
- `TRAKT_CLIENT_SECRET`: Trakt OAuth client secret
- `TRAKT_REDIRECT_URI`: Trakt OAuth callback URL, defaults to `/api/integrations/trakt/callback`
- `TRAKT_USE_MOCK_DATA`: set `1` to force deterministic local Trakt mock sync data
- `INTERNAL_SYNC_SECRET`: optional secret for protected internal Trakt sync calls; falls back to `AUTH_SECRET` if omitted
- `SCREENLANTERN_INTERNAL_URL`: base URL the local Netflix sync helper should call; use `http://app:3000` inside Docker helper containers
- `NETFLIX_SYNC_USER_EMAIL`: ScreenLantern user email that should receive imported Netflix watched history
- `NETFLIX_SYNC_PROFILE_NAME`: optional Netflix profile name to select before exporting viewing activity
- `NETFLIX_SYNC_HEADLESS`: set `0` for one-time Netflix helper setup if you need an interactive browser profile
- `NETFLIX_SYNC_USER_DATA_DIR`: persistent Chromium profile directory for the Netflix helper
- `NETFLIX_SYNC_STORAGE_STATE_PATH`: cross-platform Playwright storage-state file saved during setup and reused by Docker sync runs
- `NETFLIX_SYNC_DOWNLOAD_DIR`: temporary download directory for Netflix CSV exports

Recommended local integration modes:

- Development and Playwright: `AI_USE_MOCK_DATA=1`, `TMDB_USE_MOCK_DATA=1`, and `TRAKT_USE_MOCK_DATA=1`
- Local-first real assistant with OpenAI, live catalog, and real Trakt: `AI_PROVIDER=openai`, `AI_USE_MOCK_DATA=0`, `OPENAI_API_KEY` or `AI_API_KEY` set, `TMDB_USE_MOCK_DATA=0`, and `TRAKT_USE_MOCK_DATA=0`
- Local-first real assistant with Ollama, live catalog, and real Trakt: `AI_PROVIDER=ollama`, `AI_USE_MOCK_DATA=0`, `AI_BASE_URL=http://localhost:11434/v1`, `AI_MODEL=llama3.2`, `TMDB_USE_MOCK_DATA=0`, and `TRAKT_USE_MOCK_DATA=0`
- Playwright smoke runs use the repo's built-in `webServer` config, which starts `npm run dev -- --hostname localhost --port 3100` with `AI_USE_MOCK_DATA=1`, `TMDB_USE_MOCK_DATA=1`, and `TRAKT_USE_MOCK_DATA=1` so assistant smoke coverage stays deterministic.
- Production-like local check with live catalog: `TMDB_USE_MOCK_DATA=0` plus a real `TMDB_API_KEY`
- Trakt live OAuth: set real `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`, and a matching `TRAKT_REDIRECT_URI`
- If ScreenLantern is running inside Docker and Ollama is running on your host machine, use `AI_BASE_URL=http://host.docker.internal:11434/v1` instead of `localhost`
- For the optional Dockerized Netflix sync helper, set `SCREENLANTERN_INTERNAL_URL=http://app:3000` so the helper can reach the app across the Compose network

## Release-Readiness Notes

- For a production-style release check, set `TMDB_API_KEY` and keep `TMDB_USE_MOCK_DATA=0`.
- If `TMDB_API_KEY` is missing, ScreenLantern falls back to the local mock catalog and surfaces that state in Settings so the failure mode is explicit.
- If Trakt OAuth credentials are missing, Settings keeps Trakt import controls visible but clearly unavailable instead of failing silently.
- If `AI_USE_MOCK_DATA=1`, the assistant falls back to deterministic mock-answer mode instead of a live model call.
- If `AI_PROVIDER=openai` and no OpenAI-compatible API key is configured, the assistant also falls back to deterministic mock mode.
- If `AI_PROVIDER=ollama`, ScreenLantern uses Ollama's local OpenAI-compatible `/v1/chat/completions` API and defaults to `http://localhost:11434/v1`.
- Search and Browse cards are intentionally trimmed for MVP hardening. Richer save, fit, and handoff decisions belong on Title Detail, Home, and Library.
- Supported provider handoff actions remain intentionally narrow and honest. Unsupported providers still show availability without a fake handoff button.
- Trakt import controls are intentionally title-level in MVP. Bulk import cleanup and richer conflict-resolution tooling remain post-MVP.
- Imported-state badges and cleanup are now integration-aware. Library imported filters are generic, and title detail can distinguish Trakt imports from Netflix history imports.
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

- ScreenLantern adds provider handoff actions on title detail and on Home/Library cards when a reliable provider destination can be constructed.
- Handoff is derived from the existing provider-availability model and stays region-aware through `TMDB_WATCH_REGION`.
- Handoff classification is intentionally explicit:
  - `title_direct`: ScreenLantern can open the title directly in the provider
  - `provider_search`: ScreenLantern can open provider search results for the title
  - `provider_home`: ScreenLantern can only open the provider home or browse surface
  - `availability_only`: provider availability is known, but ScreenLantern does not claim a reliable handoff action
  - `unknown`: provider availability itself is unavailable right now
- Current supported provider strategies are intentionally conservative:
  - `Search in ...` support for `Netflix`
  - `Search in ...` support for `Hulu`
  - `Search in ...` support for `Prime Video`
  - `Search in ...` support for `Max`
  - `Search in ...` support for `Apple TV` / `Apple TV Plus`
  - `Search in ...` support for `Peacock`
  - `Search in ...` support for `Paramount Plus`
  - `Search in ...` support for `Plex`
  - `Search in ...` support for `Tubi TV`
  - `Search in ...` support for `YouTube`
- Current provider handoff coverage intentionally remains search-level only. The model supports future direct-open and provider-home cases, but ScreenLantern does not pretend they exist where they have not been verified.
- Availability-only providers remain honest, including cases like `Disney Plus` where provider availability is known but ScreenLantern has not verified a stable public handoff pattern.
- Region behavior is simple by design:
  - availability and handoff are based only on the configured `TMDB_WATCH_REGION`
  - ScreenLantern does not currently reconcile cross-region catalog differences
- Selected-service prioritization uses the signed-in viewer's provider preferences:
  - normalized provider aliases such as `Max` / `HBO Max`, `Prime Video` / `Amazon Prime Video`, and `Paramount Plus` / `Paramount Plus Premium` are treated as the same service for handoff ranking
  - matching services rank first
  - higher-confidence actions rank ahead of lower-confidence ones
  - lower-confidence provider-home actions stay out of the chooser when stronger search or direct options exist
- Detail pages remain the richest handoff surface:
  - the primary action label reflects the handoff mode, such as `Search in Max`
  - provider rows show whether a service is `Search available` or `Availability only`
  - multiple actionable services surface a `Choose service` affordance
- Cards stay quieter and only render handoff controls when a real actionable destination exists.
- Other providers still show honest availability, but ScreenLantern avoids fake or broken `Open in ...` buttons when a trustworthy destination is not available.
- Detail pages show fallback copy like `Available on Disney Plus, but direct open is unavailable.`

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
- Netflix watched-history sync stores `WATCHED` rows with a dedicated `NETFLIX_IMPORTED` source context so ScreenLantern can show Netflix-specific source labels without confusing them with Trakt.
- ScreenLantern surfaces that source context in the personal places where it matters most:
  - Title Detail shows whether watched, watchlist, or taste state came from Trakt or from manual ScreenLantern actions
  - Library collection views can be filtered to imported or manual personal state for the signed-in user's own profile
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

## Netflix History Sync

- ScreenLantern now includes an optional local-only Netflix history sync helper.
- The helper is designed for local installs and works best as a separate Docker Compose profile or a direct `tsx` script run.
- The helper keeps its Chromium profile, cross-platform login state, and temporary downloads in `./.netflix-sync`, which is ignored by git and shared with the optional Docker helper container.
- Sync flow:
  - the helper opens Netflix viewing activity using a persistent Chromium profile
  - it downloads the official viewing-history CSV locally
  - it converts the CSV into normalized watched-title rows
  - it calls a protected internal ScreenLantern route using `INTERNAL_SYNC_SECRET`
  - ScreenLantern matches rows to TMDb titles and imports personal `WATCHED` state
  - the helper deletes the downloaded CSV after import
- The helper does not need your Netflix password in ScreenLantern. It relies on the browser profile staying logged into Netflix.
- First-time setup:
  - run `npm run netflix:setup` on your host machine so Playwright can open a real browser window for Netflix login and any challenge steps
  - setup saves Playwright storage state into `./.netflix-sync/storage-state.json`
  - after that, the Docker helper reuses that saved login state for headless sync runs
- Sync commands:
  - direct host run: `npm run netflix:sync`
  - Docker helper profile: `docker compose -f docker-compose.prod.yml --profile netflix-sync run --rm netflix-sync`
- One-command standup options:
  - dev: `npm run docker:dev:standup`
  - prod-like: `npm run docker:prod:standup`
  - these start ScreenLantern, wait for the app to be reachable, then run Netflix sync automatically when `./.netflix-sync/storage-state.json` and `NETFLIX_SYNC_USER_EMAIL` are both present
  - if setup has not been completed yet, the app still starts and the standup script skips Netflix sync with a clear message
- The Docker helper is best for repeat sync runs after local setup. It reuses the host `./.netflix-sync/storage-state.json`, which avoids relying on a macOS browser profile inside the Linux helper container.
- The helper is intentionally narrow in v1:
  - watched history only
  - Netflix only
  - title-level imports only
  - no ratings, watchlist, or episode-progress sync yet

## AI Recommendation Assistant

- ScreenLantern now includes a dedicated `/app/assistant` page in the protected shell.
- The assistant can run against either:
  - OpenAI, using the configured API key and model
  - a local Ollama server, using its OpenAI-compatible API
  - deterministic mock mode for local testing
- The assistant is intentionally narrow:
  - recommend what to watch
  - refine by runtime, media type, saved-state, service, or freshness constraints
  - answer “why this?” for a title in the current context
  - help with solo or active-group decisions
- The assistant keeps one lightweight persisted thread state per signed-in user:
  - current source scope such as recommendations, watchlist, library, or shared saves
  - current ask constraints such as movies, funny, under 2h, our services, or unwatched-only
  - the last recommendation set for explanation follow-ups like `Why those?`
  - rejected/recently declined title keys for follow-ups like `Not those` and `Give me 3 different ones`
  - an optional reference title for similarity asks such as `something like Severance`
- The assistant page shows a subtle `Current ask` strip that summarizes the active context plus the constraints ScreenLantern is still carrying forward.
- `Start fresh` clears:
  - the visible transcript
  - the persisted current ask
  - previous recommendation/rejection memory
- The assistant stays grounded in:
  - the signed-in user’s current persisted recommendation context
  - live TMDb catalog and provider availability when `TMDB_USE_MOCK_DATA=0`
  - personal imported Trakt history when Trakt is connected
  - existing ScreenLantern recommendation, fit, library, watchlist, and provider-handoff services
- Supported refinement follow-ups include:
  - `Why those?`
  - `Not those`
  - `Give me 3 different ones`
  - `Only movies`
  - `Only shows`
  - `Only on our services`
  - `Something lighter`
  - `Under 2 hours`
  - `What about from our watchlist?`
  - `What about the library?`
- The assistant does not:
  - answer broad general-knowledge chat
  - claim provider entitlements beyond ScreenLantern’s known availability data
  - expose raw internal score math
  - blur personal, shared, and household-only state
- Tool contract used by the assistant:
  - `get_active_context`
  - `get_recommended_titles`
  - `get_watchlist_candidates`
  - `get_library_candidates`
  - `search_titles`
  - `get_fit_summary`
- Result rendering stays practical:
  - assistant answers are short
  - recommended titles render as structured ScreenLantern cards
  - title detail click-through and provider handoff actions are preserved
- Suggested local Ollama setup:
  - install and run Ollama locally
  - pull a model such as `ollama pull llama3.2`
  - if ScreenLantern is running directly on your Mac, set `AI_PROVIDER=ollama` and `AI_BASE_URL=http://localhost:11434/v1`
  - if ScreenLantern is running through `docker:dev:up` or `docker:prod:up`, set `AI_PROVIDER=ollama` and `AI_BASE_URL=http://host.docker.internal:11434/v1`
  - set `AI_USE_MOCK_DATA=0`

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
- Broad general-purpose AI chat, open-ended conversational search, and deeper multi-thread assistant workflows
- Native mobile clients
