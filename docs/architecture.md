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
- Trakt as an optional user-owned history import source

## System Layers

### Presentation Layer

- App Router pages and layouts
- Shared UI components for navigation, cards, filters, forms, and context switching
- Server actions and route handlers for user-initiated mutations

### Application Layer

- Services for auth/session access
- Services for household/group management
- Catalog services that abstract TMDb
- Provider-handoff services that derive honest direct, search-level, or availability-only actions from normalized provider data
- Trakt connection and sync services for importing personal watched history, ratings, and watchlist state
- Interaction services for watchlist and taste signals
- Shared-watchlist services for collaborative planning intent
- Recommendation services for solo and group modes
- Library workspace services that reuse recommendation, provider, and interaction signals
- Title-fit services that derive cross-user comparison and conflict summaries from existing state
- Activity services that emit and read household-safe collaborative history
- AI assistant orchestration service that calls structured ScreenLantern tools instead of replacing recommendation logic

### Data Layer

- PostgreSQL stores users, households, groups, interactions, preferences, cached metadata, recommendation runs, and Trakt connection metadata
- Prisma provides typed database access
- TMDb metadata is normalized into internal service types before UI consumption
- Trakt OAuth tokens are stored encrypted and only used inside server-side integration services

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

### Shared Watchlist Intent Stays Separate

Collaborative planning is modeled separately from both personal watchlists and group watch history.

- personal `WATCHLIST` interactions remain user-owned taste and library state
- `SharedWatchlistEntry` stores explicit planning intent for either an exact group context or the full household
- shared saves record who saved the title and which context the title was saved for
- shared saves can influence group resurfacing, reminders, and Library sections without becoming personal likes, dislikes, or watched history

### Imported Personal History Stays Personal

Trakt sync reuses the existing interaction model, but the ownership and privacy rules stay strict.

- imported watched history writes personal `WATCHED` interactions
- imported watchlist state writes personal `WATCHLIST` interactions
- imported ratings map into personal `LIKE` or `DISLIKE` interactions using a simple threshold
- imported rows use `SourceContext.IMPORTED` so sync can update only imported state later
- manual ScreenLantern actions remain authoritative and should not be silently overwritten by later imports
- imported data never becomes shared watchlist state, group watch history, or household activity automatically
- source-aware UI is intentionally narrow:
  - Title Detail shows imported-versus-manual personal state only for the signed-in user's own profile
  - Library source filters are only available on the signed-in user's personal collection views, not on shared or group collections
- imported-state cleanup is title-scoped in MVP:
  - a protected route can delete only the signed-in user's imported `WATCHLIST`, `WATCHED`, or rating-derived taste rows for one title
  - the cleanup route never touches manual interactions, shared watchlist entries, or group watch sessions

### Household Activity Stays Explicitly Shared

The household activity feed only records events that were already intentionally shared or governance-relevant.

- activity rows are written from existing business flows such as shared saves, group watch sessions, invites, owner transfer, and member removal
- private solo interactions such as personal watchlist saves, likes, dislikes, hides, and solo watched history never emit household activity
- the feed is household-scoped, server-filtered, and readable, not a compliance-grade audit trail
- title-linked events can reuse existing title detail routes rather than duplicating navigation logic

### Fresh User Context Over Session Claims

Protected requests re-read the current user row from PostgreSQL instead of trusting potentially stale JWT role or household claims. This makes ownership transfer, member removal, and other governance changes show up immediately in server-rendered UI and owner-only APIs.

### Provider and History Abstraction

TMDb is the initial catalog source, but catalog access flows through internal services so providers can later be swapped or augmented with Watchmode or other metadata APIs. Trakt is modeled separately as a user-owned history source rather than a catalog source.

### Normalized Catalog Contract

Catalog responses are normalized into a shared ScreenLantern title shape before page components render.

- `title` prefers TMDb `title` for movies and `name` for TV
- `releaseDate` represents movie `release_date` or TV `first_air_date`
- `runtimeMinutes` represents movie runtime or TV episode runtime
- `providerStatus` distinguishes `available`, `unavailable`, and `unknown`
- Media-specific detail fields such as seasons remain available on `TitleDetails`

### MVP Surface Hierarchy Stays Intentional

ScreenLantern intentionally gives different surfaces different jobs.

- Search and Browse are shortlist builders
- Title Detail, Home, and Library are decision surfaces
- Reminders and Activity are supporting reference surfaces

That means richer context-aware mutations are intentionally concentrated where the active solo or group context is clearest, which reduces duplicated UI noise and avoids misleading “act everywhere” behavior.

### Streaming Handoff Stays Honest

Provider availability and provider handoff are related, but they are not treated as the same thing.

- TMDb tells ScreenLantern where a title is available in a configured region
- a separate handoff layer decides whether ScreenLantern can construct a trustworthy provider destination
- supported providers currently use search-level URLs rather than fake title deep links
- unsupported providers remain availability-only even when provider availability is known
- the signed-in viewer's selected providers are used to prioritize handoff choices without leaking unrelated household data into the UI

### Release-Readiness and Config Clarity

The app is designed to fail honestly when streaming metadata or handoff assumptions are incomplete.

- Settings surfaces whether ScreenLantern is in live TMDb mode or mock catalog mode
- Settings also surfaces whether Trakt linking is unavailable, in mock mode, or connected for the signed-in user
- missing live TMDb config does not silently hide behind the UI during a release review
- missing Trakt OAuth config keeps the integration visible but clearly disabled
- recommendation, provider, and handoff failures should land in user-facing notices or empty states rather than route crashes
- smoke coverage is biased toward the main discovery-to-handoff path instead of broad, noisy surface coverage

### Recommendation Engine as a Service

Recommendation logic is isolated behind `getRecommendedTitles`, `getUserTasteProfile`, and `getGroupTasteProfile`. The UI does not directly encode ranking logic.

### Imported History Signal Weighting

Imported interactions (Trakt and Netflix) are used in recommendation scoring but with deliberately reduced weight compared to manual ScreenLantern actions.

- manual `LIKE` weight: 3 | imported `LIKE` weight: 2.0
- manual `WATCHED` weight: 1.5 | imported `WATCHED` weight: 0.8
- manual `WATCHLIST` weight: 1 | imported `WATCHLIST` weight: 0.7
- manual `DISLIKE` weight: -4 | imported `DISLIKE` weight: -3.0
- `HIDE` remains -5 regardless of source

Imported `WATCHED` history is tracked separately as `importedWatchedTmdbKeys` inside the `TasteProfile`. This allows tiered watched suppression without blurring the manual vs imported distinction.

### Recency Decay

Interaction weights are multiplied by a time-decay factor before shaping genre scores, media type preferences, and runtime preferences. This does not affect set membership (disliked/hidden/watched keys remain binary).

Decay schedule (applied at taste profile build time):
- ≤ 14 days: 1.3× (very fresh signal, small bonus)
- ≤ 90 days: 1.0× (full weight)
- ≤ 365 days: 0.75×
- > 365 days: 0.5×

Titles watched in the last 30 days are also tracked separately as `recentlyWatchedTmdbKeys`.

### Tiered Watched Suppression

`scoreRecommendationCandidate` applies one of three exclusive watched penalties:

1. `recentlyWatchedTmdbKeys` contains key → -65 (very strong: watched in last 30 days)
2. `importedWatchedTmdbKeys` contains key (not recent) → -48 (strong: in Trakt/Netflix history)
3. `watchedTmdbKeys` contains key only → -24 (mild: manual, rewatch potential remains)

The most severe applicable tier wins. Penalties do not stack.

### Watchlist Items as Scored Candidates

Personal watchlist items are included in the main recommendation candidate pool (in addition to appearing in dedicated resurfacing lanes). This means a watchlist title can rank in the top-18 main recommendations if it scores well against the current profile. Resurfacing lanes remain separate and use watchlist-specific explanations.

### Recommendation Explanation Contract

Recommendation results carry structured explanation objects rather than ad hoc UI strings.

- `category` identifies the kind of signal: `genre_overlap`, `group_overlap`, `provider_match`, `runtime_fit`, `media_fit`, `watchlist_resurface`, `watch_history`, `group_watch_history`, `fresh_group_pick`, `recency_signal`, `imported_history`, `fallback`
- `summary` is short, human-readable card copy
- `detail` gives one extra layer of context for the lightweight “Why this?” disclosure

Watch history explanations distinguish between:
- recently watched: “You watched this recently” (signals why it is held back)
- imported history: “In your imported viewing history” (Trakt/Netflix source is named)
- manual watched: “You have watched this before” (mild rewatch framing)

This keeps recommendation transparency close to the scoring rules and makes the same primitives reusable for the current assistant layer and future debugging surfaces.

### Watchlist Resurfacing as a Recommendation Layer

Home resurfacing lanes are built as a lightweight extension of the recommendation service instead of a separate notification system.

- solo mode uses the active profile's watchlist
- group mode uses:
  - the union of personal watchlists from the selected members
  - exact-group shared watchlist entries
  - household-shared watchlist entries
- exact current-group watch history suppresses stale group rewatches
- selected-service availability can promote a title into the `Available now on your services` lane
- unknown provider data never becomes a positive availability signal

This keeps resurfacing deterministic, explainable, and reusable for future notification work without creating a second recommendation engine or background system.

### Reminder Inbox as a Persisted Context Layer

ScreenLantern stores lightweight reminder rows per signed-in user and recommendation context.

- reminder generation reuses the watchlist resurfacing snapshot instead of re-ranking titles from scratch
- reminder persistence only adds user-specific state such as read and dismissed
- reminder records are keyed by user, context, category, and title so solo and group reminders remain separate
- the app shell badge and reminders page refresh the current context on demand

This keeps reminders explainable, avoids duplicate logic, and creates a future-friendly bridge toward push or email delivery without implementing external delivery in MVP.

### Reminder Preferences Stay User-Owned

Reminder tuning is stored per signed-in user in a small one-to-one preference record rather than as a shared household setting.

- users can enable or disable reminder categories independently
- solo and group reminder generation can be turned on or off separately
- reminder pace controls how many softer resurfacing reminders survive after higher-value `available_now` items
- dismissed-reminder reappearance is handled as a simple fixed-cooldown policy instead of a general-purpose rules engine

This keeps reminder control household-safe, deterministic, and easy to extend without introducing background infrastructure or shared governance complexity.

### Library Intelligence Reuses Existing Signals

The Library decision workspace is intentionally assembled from existing domain signals instead of introducing a separate ranking system or new persistence model.

- watchlist candidate sections reuse the watchlist resurfacing snapshot
- shared Library sections reuse the same persisted shared-watchlist entries used by detail pages and group resurfacing
- provider-aware badges reuse the same selected-service availability classification used on Home and in reminders
- solo sections reuse personal interaction state for quick triage actions
- group sections reuse exact-group watch-session state to suppress stale shared picks
- group Library actions stay narrower than solo actions so shared decision-making does not silently mutate every participant's personal taste profile

This keeps the Library explainable, context-aware, and lightweight while preserving a clean path toward future reminder tuning or notification delivery.

### Cross-User Fit Summaries Stay Derived

Title-fit transparency is intentionally assembled from existing state instead of creating a new persisted comparison or analytics model.

- personal interactions provide direct signals such as watchlist, like, dislike, hide, and watched
- group watch sessions provide exact watched-together truth for the active participant set
- shared watchlist entries explain collaborative planning intent for the active group or household
- existing solo recommendation heuristics are reused per household member to classify lightweight fit states such as `Already likes it`, `Could work well`, or `Potential conflict`
- title-detail summaries collapse those signals into non-technical copy such as `Best fit`, `Good shared fit`, `Safe compromise`, `Mixed fit`, or `Watched together`

This keeps “who is this best for?” honest, deterministic, and reusable without adding a separate scoring store or debug dashboard.

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
7. Search and Browse cards stay intentionally lighter-weight, nudging richer save and comparison actions onto title detail where context is clearer.

### TMDb Cache and Resilience Flow

1. Genre catalogs are cached in memory per media type for 24 hours.
2. Provider catalogs are cached in memory per media type and watch region for 24 hours.
3. Per-title watch-provider payloads are cached in memory and reused from `TitleCache` for 12 hours when available.
4. Title detail failures attempt a recent `TitleCache.metadataJson` fallback before returning an error state.
5. Live TMDb failures surface notices to the UI rather than crashing pages.

### Streaming Handoff Flow

1. Title detail, Home, or Library resolves normalized provider availability for a title.
2. The provider-handoff service dedupes provider rows, prefers the best availability bucket per provider, normalizes provider aliases, and resolves a provider-specific handoff classification.
3. Actionable provider modes are intentionally simple:
   - `title_direct`
   - `provider_search`
   - `provider_home`
   - `availability_only`
4. The signed-in viewer's selected providers are used to rank likely handoff choices first, with normalized aliases such as `Prime Video` / `Amazon Prime Video` treated as the same service.
5. Higher-confidence direct and search actions rank ahead of lower-confidence provider-home actions.
6. If one strong actionable provider exists, the UI shows a primary action label that matches the handoff mode, such as `Open in ...` or `Search in ...`.
7. If multiple actionable providers exist, the UI shows a `Choose service` affordance.
8. If availability is known but no provider has a supported handoff strategy, the UI stays honest and shows availability-only copy instead of a broken button.

### Trakt Link and Sync Flow

1. The signed-in user opens Settings and starts Trakt connect.
2. ScreenLantern redirects through Trakt OAuth and stores a short-lived state cookie for CSRF protection.
3. The callback exchanges the code for tokens, fetches the Trakt profile, encrypts the tokens, and stores a user-owned `UserTraktConnection` row.
4. Manual `Sync now` resolves a valid user-scoped Trakt connection, refreshing the token first if needed.
5. The sync service reads Trakt last-activity timestamps and decides whether each category needs work:
   - watched movies
   - watched shows
   - rated movies
   - rated shows
   - watchlist movies
   - watchlist shows
6. Imported titles are matched by TMDb ids where possible and normalized into `TitleCache` rows before interaction writes.
7. Imported interaction rows are written with `SourceContext.IMPORTED` so later syncs can update imported state without trampling manual ScreenLantern changes.
8. `UserTraktConnection` also stores a user-owned sync mode plus last-attempt metadata so freshness decisions stay on the same record as the OAuth tokens.
9. The same row stores only the latest compact last-sync trigger and summary payload so Settings can show what changed, whether the sync was manual or automatic, and a few recent imported titles without a separate sync-history table.
10. Automatic refresh calls the same `syncTraktAccount` service through two thin entry points:
   - an authenticated app-open trigger for signed-in users
   - a secret-protected internal route for future scheduler or cron use
11. `DAILY` mode requires a first manual import, then refreshes opportunistically when the last successful sync is older than one day.
12. `ON_LOGIN_OR_APP_OPEN` mode can refresh more aggressively, using a shorter stale window and allowing the first import to happen automatically after connect.
13. Failed automatic syncs do not mutate imported data mid-stream, and repeated failures back off instead of retrying on every page load.
14. Settings derives a lightweight sync review from the stored summary plus last status:
   - successful changed syncs show imported counts and a recent-import preview
   - no-change syncs say so directly
   - failed syncs avoid raw internal error details and steer the user toward retrying or reconnecting
15. Title Detail can clear imported watched, watchlist, or rating-derived state for one title without disconnecting Trakt or deleting manual ScreenLantern state.
16. Disconnect removes the stored Trakt connection and encrypted tokens but intentionally leaves already imported personal interaction rows in place.

### Personal Interaction Flow

1. User triggers watchlist, watched, like, dislike, or hide.
2. Mutation validates session and household authorization.
3. Interaction service upserts the user-title interaction set.
4. Recommendation profile and cached counts are refreshed on read, not via background jobs in MVP.

### Shared Watchlist Flow

1. User opens title detail or a Library card in a valid solo or group context.
2. Shared-save mutation validates the signed-in user and optional acting profile against the same household.
3. `Save for current group` re-resolves the persisted active group context on the server and derives an exact participant-set context.
4. `Save for household` stores a household-scoped planning row.
5. Shared rows persist who saved the title, the scope, the context label, and any saved-group reference without mutating personal taste rows.

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
3. In group mode, the service also loads explicit shared watchlist entries for the exact current group and the household.
4. Cached `TitleCache` rows are mapped back into normalized titles.
5. Provider freshness is checked on demand for those watchlist titles:
   - recent provider snapshots are reused
   - stale watchlist titles refresh provider availability before lane scoring
6. Resurfacing scoring suppresses hidden, disliked, already-watched, and exact-group-watched titles.
7. Titles with known selected-service availability populate the `Available now on your services` lane first.
8. Remaining qualifying titles can appear in `Back on your radar` with explanation copy that distinguishes personal watchlist intent from group-shared or household-shared planning.

### Reminder Generation Flow

1. The protected shell badge or reminders page requests reminders for the current active context.
2. The server resolves a valid household-scoped solo or group context.
3. The signed-in user's reminder preferences are loaded.
4. The watchlist resurfacing snapshot is regenerated on demand using the existing provider freshness rules.
5. Candidate reminders are mapped into categories:
   - `available_now`
   - `watchlist_resurface`
   - `group_watch_candidate`
6. Category toggles, solo/group toggles, and reminder pace filter the candidate set before reminder rows are written.
7. Reminder rows are upserted per user and context, while stale reminder rows for that same context are deactivated.
8. Read state stays read unless a reminder changes materially enough to feel new again.
9. Dismissed reminders stay inactive unless reappearance is enabled and the fixed cooldown has elapsed.

### Library Workspace Flow

1. Library page loads the resolved active recommendation context for the signed-in user.
2. The Library service reuses the watchlist resurfacing snapshot to build smart sections such as `Available now`, `Best from your watchlist`, `Good for this group`, and `Recently saved`.
3. Shared-watchlist services also load `Shared for this group` and `Shared for household` collections where relevant.
4. Provider availability is refreshed on demand with the existing title-cache freshness rules.
5. Library items are labeled as:
   - `Available now`
   - `Available elsewhere`
   - `Provider status unknown`
6. Solo Library sections resolve quick triage actions against the selected solo profile, not just the signed-in account.
7. Group Library decision sections allow explicit `Watched by current group`, while exact-group watched history is shown separately and removed from fresh-candidate sections.
8. Focus filters and sort modes are applied server-side so the page stays deterministic and context-correct across refreshes.

### Title Fit Summary Flow

1. Title detail resolves the authenticated user and a valid household-scoped recommendation context.
2. The title-fit service loads existing household-safe signals for the requested title:
   - personal interactions for household members
   - shared watchlist entries for the active group and household
   - group watch sessions for watched-together history
   - existing solo taste-profile heuristics for each member
3. Each household member receives a concise derived fit state such as `Already likes it`, `Saved it personally`, `Could work well`, or `Potential conflict`.
4. The active solo or group context is summarized into non-technical fit copy such as:
   - `Best fit for Brendan`
   - `Good shared fit for Brendan + Palmer`
   - `Mixed fit for Brendan + Katie`
   - `Brendan + Palmer already watched this together`
5. Detail pages render the richer fit summary and household rows, while Home and Library cards can reuse a smaller fit label derived from the same explanation primitives.

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

### Household Activity Flow

1. A shared or governance mutation succeeds inside an existing service flow.
2. That same server-side flow emits a household activity row in the same transaction where practical.
3. The activity row stores household, actor, event type, timestamp, optional title reference, optional context label, and concise summary/detail copy.
4. The `/app/activity` page resolves the authenticated user's current household and reads only that household's recent activity.
5. Title-linked events render a link back to title detail so collaborative history stays actionable instead of becoming a dead log.

## Data Boundaries

- Auth and household authorization are enforced on the server
- Personal interactions are always tied to a single user
- Personal watchlist interactions, shared watchlist entries, and group watch sessions are stored as separate state models
- Group watch sessions are stored separately from personal interactions
- Cross-user fit summaries are derived on read from existing household-safe state and never persisted as a shared cross-household artifact
- Saved groups only reference members inside one household
- Group recommendation runs never overwrite solo user state
- Group resurfacing can use shared watchlist entries, but those entries never become personal taste writes automatically
- Reminder rows belong to one signed-in user and one resolved recommendation context
- Read and dismiss actions only mutate reminder state, not taste or library state
- Reminder preferences belong only to the signed-in user; there is no shared household reminder policy in MVP
- Group Library sections never imply a shared taste write for all participants
- Recommendation explanations are generated in the service layer, not assembled ad hoc in page components
- Household activity rows belong to one household and only include explicitly shared or governance-relevant events
- Private personal interactions never appear in the household activity feed unless they were expressed through an already-shared flow
- Trakt connections are one-to-one with a signed-in user and are never shared across household members
- Trakt imports stay personal and never become shared watchlist state, group watch history, or household activity automatically
- Invite creation, revocation, and member removal are owner-only operations in MVP
- Ownership transfer is owner-only and constrained to another member in the same household
- TMDb-specific response differences are normalized at the service layer, not in page components
- Provider availability is always interpreted for the configured `TMDB_WATCH_REGION`
- Handoff actions are derived from provider availability plus the signed-in viewer's provider preferences, not from a shared household setting
- Unsupported provider handoffs stay availability-only instead of falling back to fake universal deep links
- Current verified provider coverage is intentionally conservative and search-level only:
  - Netflix
  - Hulu
  - Prime Video
  - Max
  - Apple TV / Apple TV Plus
  - Peacock
  - Paramount Plus
  - Plex
  - Tubi TV
  - YouTube
- Direct provider account linking and broader provider-home or title-deep-link strategies remain future work

## AI Assistant Surface

The assistant reuses a small service-oriented tool contract:

- `searchTitles(input)`
- `getTitleDetails(input)`
- `getRecommendedTitles(input)`
- `getLibraryWorkspace(input)`
- `getTitleFitSummary(input)`
- `getTraktConnectionSummary(input)`

The assistant itself is intentionally thin:

- one user-owned persisted conversation row
- one lightweight persisted `threadStateJson` object for the current ask
- a server-side orchestration layer
- a deterministic mock-answer path for local testing
- a live model path that only uses grounded tool outputs

The assistant does not become a new source of truth. Recommendation ranking, fit summaries, library state, watchlist state, provider availability, and Trakt-import ownership all remain in their existing domain services.

Assistant turn handling is now state-first rather than transcript-first:

- each signed-in user still has one active thread in MVP
- `messagesJson` stores the visible transcript
- `lastContextJson` stores the resolved solo/group context snapshot
- `threadStateJson` stores only the current recommendation ask:
  - active source scope
  - active constraints such as media type, mood, runtime cap, and preferred-service restriction
  - last recommendation title keys
  - rejected title keys for “not those / different ones” follow-ups
  - an optional reference title for “something like X”
- short follow-ups update `threadStateJson` first, then ScreenLantern picks the grounded tool path
- explanation follow-ups reuse the last recommendation set instead of fetching a new one
- `Start fresh` deletes the conversation row so both transcript and current-ask memory are cleared together

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
- Provider account linking, entitlement sync, and richer deep-link coverage across more streaming services
- Rich explanation history views and per-title recommendation trace screens
- Richer long-term AI memory, multi-thread history, and broader agent tooling beyond the current recommendation assistant
- Push, email, or cron-triggered resurfacing notifications
- Advanced faceted Library search, bulk cleanup tooling, and per-section notification preferences
- Custom reminder cooldown windows, digest schedules, and per-group reminder policies
- Multi-owner management, owner-to-owner transfer flows, and invite email delivery
- Comments, reactions, per-title discussion threads, and richer collaborative activity filtering
- Group watch-session editing, merge, and duplicate-session management
