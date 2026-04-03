# ScreenLantern Architecture

## Architecture Summary

ScreenLantern is a Next.js App Router application with server-rendered and client-enhanced experiences for authentication, discovery, personal library management, and recommendations.

Core technologies:

- Next.js with App Router and TypeScript
- Prisma with PostgreSQL
- Auth.js credentials provider with password hashing
- Tailwind CSS and shadcn/ui-inspired component primitives
- Zod for request validation
- TMDb as the external catalog metadata and provider source

## System Layers

### Presentation Layer

- App Router pages and layouts
- Shared UI components for navigation, cards, filters, forms, and context switching
- Server actions and route handlers for user-initiated mutations

### Application Layer

- Services for auth/session access
- Services for household/group management
- Catalog services that abstract TMDb
- Interaction services for watchlist and taste signals
- Recommendation services for solo and group modes
- Library workspace services that reuse recommendation, provider, and interaction signals

### Data Layer

- PostgreSQL stores users, households, groups, interactions, preferences, cached metadata, and recommendation runs
- Prisma provides typed database access
- TMDb metadata is normalized into internal service types before UI consumption

## Key Design Decisions

### Household-First Domain Model

Every user belongs to a household. Personal state remains user-scoped, while saved recommendation groups and invites are household-scoped. Users also carry an owner/member household role in MVP so privileged actions can be enforced on the server.

Household governance intentionally stays simple:

- one active `OWNER` per household in MVP+
- any number of `MEMBER`s
- owner transfer promotes one member and demotes the prior owner in one server-side mutation

### Interaction-Centric Taste Modeling

Instead of building separate tables for every library bucket, ScreenLantern records user-title interactions with typed signals such as watchlist, watched, like, dislike, and hide. This simplifies storage, auditing, and future recommendation tuning.

### Persisted Recommendation Context

Recommendation context is stored server-side per signed-in user. The resolved context can point at:

- one household member profile in solo mode
- a saved household group in group mode
- an ad hoc household member combination in group mode

Stale or invalid saved contexts are normalized back to a safe solo fallback before the UI uses them.

### Group Watch Sessions Stay Separate

ScreenLantern models shared watching as a dedicated `GroupWatchSession`, not as a batch write of personal `WATCHED` interactions. This keeps solo taste and shared history separable while still giving recommendation services a structured shared-watch signal.

### Fresh User Context Over Session Claims

Protected requests re-read the current user row from PostgreSQL instead of trusting potentially stale JWT role or household claims. This makes ownership transfer, member removal, and other governance changes show up immediately in server-rendered UI and owner-only APIs.

### Provider Abstraction

TMDb is the initial source, but catalog access flows through internal services so providers can later be swapped or augmented with Watchmode, Trakt, or other APIs.

### Normalized Catalog Contract

Catalog responses are normalized into a shared ScreenLantern title shape before page components render.

- `title` prefers TMDb `title` for movies and `name` for TV
- `releaseDate` represents movie `release_date` or TV `first_air_date`
- `runtimeMinutes` represents movie runtime or TV episode runtime
- `providerStatus` distinguishes `available`, `unavailable`, and `unknown`
- Media-specific detail fields such as seasons remain available on `TitleDetails`

### Recommendation Engine as a Service

Recommendation logic is isolated behind `getRecommendedTitles`, `getUserTasteProfile`, and `getGroupTasteProfile`. The UI does not directly encode ranking logic.

### Recommendation Explanation Contract

Recommendation results carry structured explanation objects rather than ad hoc UI strings.

- `category` identifies the kind of signal, such as genre overlap, provider match, watchlist resurfacing, runtime fit, or prior group watch history
- `summary` is short, human-readable card copy
- `detail` gives one extra layer of context for the lightweight “Why this?” disclosure

This keeps recommendation transparency close to the scoring rules and makes the same primitives reusable for future AI or debugging surfaces.

### Watchlist Resurfacing as a Recommendation Layer

Home resurfacing lanes are built as a lightweight extension of the recommendation service instead of a separate notification system.

- solo mode uses the active profile's watchlist
- group mode uses the union of watchlists from the selected members
- exact current-group watch history suppresses stale group rewatches
- selected-service availability can promote a title into the `Available now on your services` lane
- unknown provider data never becomes a positive availability signal

This keeps resurfacing deterministic, explainable, and reusable for future notification work without introducing shared watchlist state or background jobs in MVP.

### Reminder Inbox as a Persisted Context Layer

ScreenLantern stores lightweight reminder rows per signed-in user and recommendation context.

- reminder generation reuses the watchlist resurfacing snapshot instead of re-ranking titles from scratch
- reminder persistence only adds user-specific state such as read and dismissed
- reminder records are keyed by user, context, category, and title so solo and group reminders remain separate
- the app shell badge and reminders page refresh the current context on demand

This keeps reminders explainable, avoids duplicate logic, and creates a future-friendly bridge toward push or email delivery without implementing external delivery in MVP.

### Library Intelligence Reuses Existing Signals

The Library decision workspace is intentionally assembled from existing domain signals instead of introducing a separate ranking system or new persistence model.

- watchlist candidate sections reuse the watchlist resurfacing snapshot
- provider-aware badges reuse the same selected-service availability classification used on Home and in reminders
- solo sections reuse personal interaction state for quick triage actions
- group sections reuse exact-group watch-session state to suppress stale shared picks
- group Library actions stay narrower than solo actions so shared decision-making does not silently mutate every participant's personal taste profile

This keeps the Library explainable, context-aware, and lightweight while preserving a clean path toward future reminder tuning or notification delivery.

## Request Flows

### Auth Flow

1. User submits email, password, and profile details.
2. Server validates input and hashes password with bcrypt.
3. User either creates a new household as owner or redeems an invite into an existing household as member.
4. Auth.js establishes a session.
5. Protected routes verify the session server-side.

### Invite Flow

1. A household owner creates an invite from the household screen.
2. The system generates a single-use code and a shareable `/sign-up?invite=CODE` link.
3. Invite redemption is validated server-side for existence, active state, and expiry.
4. A successful redemption creates the new user inside the invited household and consumes the invite.
5. Invalid, expired, revoked, or already redeemed invites fail gracefully.

### Ownership Transfer Flow

1. The current owner opens the household screen and chooses a member to promote.
2. The client requires explicit confirmation before submitting the transfer.
3. Server validation confirms that the requester is the current owner and the target belongs to the same household as a member.
4. In one transaction, the requester becomes `MEMBER` and the target becomes `OWNER`.
5. Invite visibility remains household-scoped, so the new owner can still manage invites created before the transfer.

### Catalog Search Flow

1. User submits search or filter parameters.
2. Server validates query params with Zod.
3. Catalog service maps movie and TV requests to the correct TMDb endpoints and parameters.
4. TMDb responses are normalized into a consistent internal title model.
5. Selected title metadata and provider snapshots may be cached locally.
6. UI renders normalized cards with provider and interaction state overlays.

### TMDb Cache and Resilience Flow

1. Genre catalogs are cached in memory per media type for 24 hours.
2. Provider catalogs are cached in memory per media type and watch region for 24 hours.
3. Per-title watch-provider payloads are cached in memory and reused from `TitleCache` for 12 hours when available.
4. Title detail failures attempt a recent `TitleCache.metadataJson` fallback before returning an error state.
5. Live TMDb failures surface notices to the UI rather than crashing pages.

### Personal Interaction Flow

1. User triggers watchlist, watched, like, dislike, or hide.
2. Mutation validates session and household authorization.
3. Interaction service upserts the user-title interaction set.
4. Recommendation profile and cached counts are refreshed on read, not via background jobs in MVP.

### Group Recommendation Flow

1. User selects a household group or ad hoc member combination.
2. Server persists the validated active context for the signed-in user.
3. Group taste profile is computed from each member's interactions and preferences.
4. Candidate titles are fetched from TMDb discover/search seeds.
5. Combined scoring applies overlap boosts, strong-dislike penalties, and a light penalty for titles the exact group already watched together.
6. Structured explanation reasons are generated alongside each ranked title.
7. Recommendation run metadata is stored for later debugging and AI explainability.

### Watchlist Resurfacing Flow

1. Home loads the resolved active recommendation context.
2. Recommendation services collect watchlist interactions for the active solo user or selected group members.
3. Cached `TitleCache` rows are mapped back into normalized titles.
4. Provider freshness is checked on demand for those watchlist titles:
   - recent provider snapshots are reused
   - stale watchlist titles refresh provider availability before lane scoring
5. Resurfacing scoring suppresses hidden, disliked, already-watched, and exact-group-watched titles.
6. Titles with known selected-service availability populate the `Available now on your services` lane first.
7. Remaining qualifying watchlist titles can appear in `Back on your radar` with watchlist-aware explanation copy.

### Reminder Generation Flow

1. The protected shell badge or reminders page requests reminders for the current active context.
2. The server resolves a valid household-scoped solo or group context.
3. The watchlist resurfacing snapshot is regenerated on demand using the existing provider freshness rules.
4. Candidate reminders are mapped into categories:
   - `available_now`
   - `watchlist_resurface`
   - `group_watch_candidate`
5. Reminder rows are upserted per user and context, while stale reminder rows for that same context are deactivated.
6. Read and dismissed state stay on the persisted reminder row and do not mutate the underlying watchlist interaction.

### Library Workspace Flow

1. Library page loads the resolved active recommendation context for the signed-in user.
2. The Library service reuses the watchlist resurfacing snapshot to build smart sections such as `Available now`, `Best from your watchlist`, `Good for this group`, and `Recently saved`.
3. Provider availability is refreshed on demand with the existing title-cache freshness rules.
4. Library items are labeled as:
   - `Available now`
   - `Available elsewhere`
   - `Provider status unknown`
5. Solo Library sections resolve quick triage actions against the selected solo profile, not just the signed-in account.
6. Group Library decision sections allow explicit `Watched by current group`, while exact-group watched history is shown separately and removed from fresh-candidate sections.
7. Focus filters and sort modes are applied server-side so the page stays deterministic and context-correct across refreshes.

### Recommendation Context Flow

1. Protected layout loads the authenticated user, household members, saved groups, and any persisted context row.
2. Recommendation-context service validates that the stored context still belongs to the same household and still references valid members or groups.
3. Invalid or stale contexts fall back to a safe solo profile.
4. Client context changes optimistically update the UI and then persist through a server-validated API route.
5. Server-rendered pages such as title detail re-read the persisted context so watched state and recommendation semantics stay aligned.

### Group Watch Flow

1. User enters a valid group recommendation context.
2. Title detail offers a dedicated “Watched by current group” action.
3. Server re-resolves the user's persisted context and verifies it is still a valid group context in the same household.
4. The app stores a `GroupWatchSession` keyed to the title and exact participant set.
5. Personal `WATCHED` interactions remain unchanged unless a user separately chooses “Watched by me”.

## Data Boundaries

- Auth and household authorization are enforced on the server
- Personal interactions are always tied to a single user
- Group watch sessions are stored separately from personal interactions
- Saved groups only reference members inside one household
- Group recommendation runs never overwrite solo user state
- Group resurfacing uses individual watchlist intent and never creates a shared household watchlist record
- Reminder rows belong to one signed-in user and one resolved recommendation context
- Read and dismiss actions only mutate reminder state, not taste or library state
- Group Library sections never imply a shared household watchlist or shared taste write for all participants
- Recommendation explanations are generated in the service layer, not assembled ad hoc in page components
- Invite creation, revocation, and member removal are owner-only operations in MVP
- Ownership transfer is owner-only and constrained to another member in the same household
- TMDb-specific response differences are normalized at the service layer, not in page components
- Provider availability is always interpreted for the configured `TMDB_WATCH_REGION`

## Future AI-Ready Surface

The MVP prepares the following service-oriented contract:

- `searchTitles(input)`
- `discoverTitles(input)`
- `getTitleDetails(input)`
- `getAvailableProviders(input)`
- `getUserTasteProfile(input)`
- `getGroupTasteProfile(input)`
- `getRecommendedTitles(input)`
- `saveToWatchlist(input)`
- `markWatched(input)`
- `likeTitle(input)`
- `dislikeTitle(input)`
- `hideTitle(input)`

These functions can later be exposed to an AI planner or chat layer without reworking the domain model.

## Security Posture

- Passwords hashed with bcrypt
- Session-based authentication via Auth.js
- Protected routes and mutations use server-side session checks
- Zod validation on public inputs
- Household membership checks guard access to shared data
- Invite redemption checks existence, expiry, and single-use status on the server

## Deferred Architectural Concerns

- Background job queue for metadata refresh
- Advanced cache invalidation and incremental sync
- Event streaming for interaction analytics
- External provider preference sync
- Cross-region availability comparison and regional fallback logic
- Rich explanation history views and per-title recommendation trace screens
- Push, email, or cron-triggered resurfacing notifications
- Advanced faceted Library search, bulk cleanup tooling, and per-section notification preferences
- Multi-owner management, owner-to-owner transfer flows, and invite email delivery
- Group watch-session editing, merge, and duplicate-session management
