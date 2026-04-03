# ScreenLantern Epics and Tickets

## Planning Assumptions

- Repository starts effectively empty and needs full MVP bootstrap
- TMDb is the only external catalog source in MVP
- GitHub CLI issue creation may be unavailable if auth is missing
- Labels should include: `epic`, `frontend`, `backend`, `auth`, `data`, `recommendation`, `ux`, `testing`, `docs`

## Priority Legend

- P0: Must land for MVP
- P1: Important for MVP polish or maintainability
- P2: Post-MVP or stretch

## Epic 1: Repo Bootstrap and Architecture Foundation

### Ticket 1.1: Scaffold Next.js application foundation

- Priority: P0
- Goal: Establish the base app structure with TypeScript, Tailwind, App Router, linting, formatting, and shared UI primitives.
- Scope:
  - Create project scaffold
  - Configure Tailwind and base layout
  - Add app shell and navigation skeleton
  - Create shared component and utility directories
- Technical notes:
  - Favor server components by default
  - Keep design system minimal and reusable
- Acceptance criteria:
  - App runs locally with `npm run dev`
  - Base layout and navigation render
  - Shared utilities and component folders exist
- Test expectations:
  - Basic smoke render of the root app shell

### Ticket 1.2: Establish environment, docs, and local tooling

- Priority: P0
- Goal: Make the project easy to run locally and safe to configure.
- Scope:
  - Add `.env.example`
  - Add setup instructions
  - Add scripts for database and seed flows
  - Add architecture and product docs
- Acceptance criteria:
  - New developer can follow docs to start the app
  - All required env vars are documented
- Dependencies:
  - 1.1

## Epic 2: Authentication and User Onboarding

### Ticket 2.1: Implement credentials auth with Auth.js

- Priority: P0
- Goal: Support secure sign up, login, logout, and session persistence.
- Scope:
  - Auth.js credentials provider
  - Sign-in page
  - Session-aware layout
  - Protected route guard
- Technical notes:
  - Store bcrypt-hashed passwords
  - Use server-side session checks in protected app areas
- Acceptance criteria:
  - User can sign up and sign in with email/password
  - Protected routes redirect anonymous users
  - Authenticated users can log out
- Test expectations:
  - Auth smoke test
  - Protected route coverage

### Ticket 2.2: Build registration flow with initial household creation

- Priority: P0
- Goal: Let a new user either create a household or join one via invite.
- Scope:
  - Registration form
  - Validation
  - Transactional creation of household and owner user
  - Invite redemption path for joining an existing household
- Acceptance criteria:
  - Registering in create mode creates both a user and a household
  - Registering in join mode adds the user to the invited household
  - Duplicate email is rejected cleanly
- Test expectations:
  - Register/create household coverage
  - Register/join household via valid invite coverage
  - Invalid invite rejection coverage
- Dependencies:
  - 2.1

## Epic 3: Household, Memberships, and Group Mode Foundation

### Ticket 3.1: Model households and household memberships

- Priority: P0
- Goal: Persist household structure cleanly.
- Scope:
  - Prisma models for household and membership relations
  - Owner/member role model
  - Household invite model
  - Session helpers for active household resolution
- Acceptance criteria:
  - Users can be resolved as household members
  - Owner-only actions can be enforced server-side
  - Authorization helpers enforce household boundaries
- Dependencies:
  - 1.1
  - 2.2

### Ticket 3.2: Implement saved household groups and active context switching

- Priority: P0
- Goal: Let users select solo or custom group recommendation contexts.
- Scope:
  - Household group CRUD
  - Active context picker in app shell
  - Solo vs group mode display state
- Acceptance criteria:
  - Household groups can be created and viewed
  - UI clearly indicates active recommendation context
- Test expectations:
  - Group selection happy-path coverage

### Ticket 3.4: Persist recommendation context server-side

- Priority: P1
- Goal: Make solo and group recommendation context durable across sessions and devices.
- Scope:
  - Per-user persisted recommendation context model
  - Server-side validation of saved group and ad hoc member selections
  - Safe fallback when saved context becomes stale
  - UI support for restoring solo profile and saved-group context
- Acceptance criteria:
  - Returning users see the last valid recommendation context restored
  - Invalid saved contexts fall back safely to solo mode
  - Context changes are server-validated and household-scoped
- Test expectations:
  - Persisted solo context coverage
  - Persisted group context coverage
  - Invalid context fallback coverage

### Ticket 3.3: Build invite and membership management

- Priority: P0
- Goal: Make multi-user household setup real for normal product usage.
- Scope:
  - Create invite UI and routes
  - Invite revocation and status display
  - Household member list with role badges
  - Safe member removal behavior
- Acceptance criteria:
  - Owners can create invites and copy a join link or code
  - Members cannot create invites
  - Invalid, expired, or redeemed invites fail gracefully
  - Member removal does not delete the removed account in MVP
- Test expectations:
  - Protected invite creation coverage
  - Membership listing coverage
  - Authorization edge-case coverage

### Ticket 3.5: Add owner transfer and governance hardening

- Priority: P1
- Goal: Make household governance safe enough for real multi-user usage without adding a heavy admin model.
- Scope:
  - Owner transfer flow with explicit confirmation
  - Current-owner surfacing in household UI
  - Owner/member action affordance cleanup
  - Authorization hardening for transfer, invite management, and member removal
- Technical notes:
  - Keep the role model to one active `OWNER` plus `MEMBER`s
  - Re-read the current user row from the database on protected requests so role changes apply immediately
- Acceptance criteria:
  - The current owner can transfer ownership to another member in the same household
  - Prior owners lose owner-only permissions immediately after transfer
  - The new owner can manage invites created before the transfer
  - Member-removal rules remain safe and consistent after transfer
- Test expectations:
  - Successful owner-transfer coverage
  - Invalid transfer coverage
  - Member transfer-attempt protection
  - Post-transfer invite-management and permission-regression coverage

## Epic 4: TMDb Integration, Catalog Search, and Browse

### Ticket 4.1: Build TMDb service client and normalization layer

- Priority: P0
- Goal: Isolate external catalog access behind internal services.
- Scope:
  - Search endpoint integration
  - Discover endpoint integration
  - Genre/provider lookup helpers
  - Mapping to internal title DTOs
  - Honest movie vs TV normalization rules
- Acceptance criteria:
  - Search and discover services return normalized results
  - TMDb-specific response details stay out of page components
  - Movie and TV discover requests use the correct TMDb parameters
- Dependencies:
  - 1.1

### Ticket 4.2: Implement search experience

- Priority: P0
- Goal: Let users search titles across media types with pagination and quick actions.
- Scope:
  - Search page
  - Query input and filters
  - Search result cards
- Acceptance criteria:
  - User can search and paginate results
  - Movie/show filter works
- Test expectations:
  - Search flow smoke test

### Ticket 4.3: Implement browse/discover experience

- Priority: P0
- Goal: Provide discovery feeds with practical filters.
- Scope:
  - Browse page
  - Genre, year, runtime, provider, and popularity filters
  - Clean empty/loading states
- Acceptance criteria:
  - User can browse without entering a text search
  - Filters update the result set predictably

### Ticket 4.4: Harden live TMDb mode, provider caching, and upstream failure handling

- Priority: P1
- Goal: Make the live TMDb integration correct, efficient, and resilient enough for normal usage.
- Scope:
  - Cache genre and provider catalogs with simple TTL rules
  - Reuse recent per-title provider snapshots from `TitleCache`
  - Distinguish provider `available`, `unavailable`, and `unknown` states
  - Return graceful notices for rate limits, network failures, and malformed responses
- Acceptance criteria:
  - Repeated provider catalog fetches are reduced by caching
  - Missing provider data does not crash browse, search, or detail routes
  - Live-mode movie and TV filters behave correctly for year and newest sorting
- Test expectations:
  - Unit coverage for discover param mapping
  - Unit coverage for provider normalization and cache reuse
  - Unit coverage for API failure handling and mock-mode compatibility

## Epic 5: Title Detail Pages and Provider Availability

### Ticket 5.1: Implement title detail service and metadata caching

- Priority: P0
- Goal: Fetch and persist selected title metadata for efficient detail pages.
- Scope:
  - Title detail service
  - Provider availability mapping
  - Cache upsert logic
- Acceptance criteria:
  - Title details render from normalized data
  - Provider availability is displayed when available
- Dependencies:
  - 4.1

### Ticket 5.2: Build title detail UI with actions

- Priority: P0
- Goal: Make title pages the primary action surface for saving and rating content.
- Scope:
  - Detail layout
  - Metadata sections for cast and seasons
  - Action buttons
- Acceptance criteria:
  - Detail page includes watchlist, watched, like, dislike, and hide actions
  - TV titles show season metadata when available
- Test expectations:
  - Title detail smoke test

## Epic 6: Personal Library and Interaction Tracking

### Ticket 6.1: Persist user-title interactions

- Priority: P0
- Goal: Track taste and library signals per user.
- Scope:
  - Interaction model
  - Upsert/remove action handlers
  - Query helpers for library buckets
- Acceptance criteria:
  - Interactions are scoped to the acting user
  - Removing or toggling states updates the library correctly
- Dependencies:
  - 3.1
  - 5.1

### Ticket 6.2: Build library views

- Priority: P0
- Goal: Surface watchlist, watched, likes, dislikes, and hidden titles.
- Scope:
  - Library page
  - Bucket tabs or sections
  - Result cards with quick actions
- Acceptance criteria:
  - Each library bucket can be viewed independently
  - Empty states are clear and actionable
- Test expectations:
  - Watchlist add/remove flow test
  - Like/dislike/hide interaction flow test

### Ticket 6.3: Model group watch sessions separately from personal watched history

- Priority: P1
- Goal: Capture shared watching without overwriting individual taste data.
- Scope:
  - Group watch-session model
  - Distinct watched-by-me vs watched-by-current-group actions
  - Server-side authorization for group watch creation
  - Minimal recommendation groundwork for prior group watches
- Acceptance criteria:
  - Group watch events record exact participants and time
  - Personal watched history is not automatically written for every participant
  - Title detail clearly distinguishes personal watched from current-group watched
- Test expectations:
  - Group watch happy-path coverage
  - Solo watched vs group watched distinction coverage
  - Authorization coverage for group watch creation

### Ticket 6.4: Turn the Library into a context-aware decision workspace

- Priority: P1
- Goal: Help users pick something from what they already saved instead of treating the Library as a passive bucket list.
- Scope:
  - Smart Library sections such as `Available now`, `Best from your watchlist`, `Good for this group`, `Recently saved`, `Already watched`, and deprioritized titles
  - Provider-aware badges and lightweight Library filters/sorts
  - Reuse of recommendation explanations on Library cards
  - Quick triage actions that stay safe across solo and group contexts
- Technical notes:
  - Reuse watchlist resurfacing and provider-availability logic instead of creating a second recommendation engine
  - Solo actions should target the selected solo profile
  - Group sections should suppress exact-group watched titles from fresh candidate lanes
  - Group Library actions should avoid ambiguous shared writes into every participant's personal taste state
- Acceptance criteria:
  - Library clearly reflects the active solo or group context
  - Users can quickly see what is available now on selected services from their Library
  - Group Library views can surface good shared candidates without implying a shared household watchlist
  - Hidden, disliked, and already watched titles are still available for cleanup without dominating fresh decision sections
- Test expectations:
  - Solo Library intelligence rendering coverage
  - Group Library intelligence rendering coverage
  - Provider-aware badge and filter coverage
  - Exact-group-watch suppression coverage
  - Quick triage action coverage

## Epic 7: Solo Recommendation Engine

### Ticket 7.1: Create user taste profile service

- Priority: P0
- Goal: Convert interactions into usable preference signals.
- Scope:
  - Genre affinity extraction
  - Provider preference shaping
  - Runtime/media type preference inference
- Acceptance criteria:
  - Taste profile reflects user interactions deterministically
- Dependencies:
  - 6.1

### Ticket 7.2: Implement solo recommendation scoring

- Priority: P0
- Goal: Rank candidate titles for a single user.
- Scope:
  - Candidate generation strategy
  - Weighted scoring rules
  - Recommendation run persistence
- Technical notes:
  - Strongly downrank hidden and disliked titles
  - Mildly boost recency and popularity
- Acceptance criteria:
  - Solo recommendations exclude strongly negative content
  - Results are stable for the same input state
- Test expectations:
  - Unit tests for scoring logic

### Ticket 7.3: Surface recommendation explanations and transparency UI

- Priority: P1
- Goal: Make recommendations easier to trust without exposing raw scoring internals.
- Scope:
  - Structured explanation contract on recommendation results
  - Concise solo and group explanation copy
  - Primary explanation on recommendation cards
  - Lightweight “Why this?” disclosure for extra detail
- Technical notes:
  - Keep explanations deterministic and close to recommendation scoring
  - Reuse structured categories for future AI and debugging surfaces
- Acceptance criteria:
  - Each surfaced recommendation includes 1 to 3 human-readable reasons
  - Solo explanations reflect personal taste and provider/runtime signals
  - Group explanations reflect safe overlap and prior exact-group watch state honestly
  - Home feed keeps active context obvious while showing explanations
- Test expectations:
  - Unit coverage for explanation generation and fallback behavior
  - Smoke coverage for explanation rendering in solo and group contexts

### Ticket 7.4: Add watchlist resurfacing and provider-aware Home lanes

- Priority: P1
- Goal: Make saved titles useful again between search sessions by resurfacing practical watchlist picks.
- Scope:
  - `Available now on your services` lane on Home
  - `Back on your radar` lane on Home
  - Watchlist-aware explanation copy that reuses the recommendation explanation contract
  - On-demand provider freshness checks for watchlist titles using existing cache infrastructure
- Technical notes:
  - Solo mode uses the active profile's watchlist
  - Group mode uses the union of the selected members' watchlists
  - Exact current-group watch history suppresses stale shared rewatches
  - Unknown provider data must never be treated as a positive “available now” signal
- Acceptance criteria:
  - Home can surface watchlist titles that are practical to start on the selected services
  - Home can resurface saved titles that still fit the current solo or group context even when they are not currently on selected services
  - Group resurfacing does not create or imply a shared household watchlist
  - Stale provider data refreshes on demand for resurfaced watchlist titles without background jobs
- Test expectations:
  - Solo watchlist resurfacing coverage
  - Group watchlist resurfacing coverage
  - Unknown-provider fallback coverage
  - Exact-group-watch suppression coverage
  - Home-lane explanation rendering coverage

### Ticket 7.5: Add in-app reminder center for resurfaced watchlist titles

- Priority: P1
- Goal: Give users a lightweight in-product inbox for resurfaced titles without introducing push or email delivery yet.
- Scope:
  - Dedicated reminders page and shell badge
  - Persisted reminder model with active, read, and dismissed state
  - Reminder generation from existing watchlist resurfacing and provider-availability logic
  - Solo and group reminder context labeling
- Technical notes:
  - Reuse resurfacing candidates instead of adding a second recommendation engine
  - Keep reminder state user-scoped even when the active context is a group
  - Refresh reminders on demand from relevant app loads instead of background jobs
- Acceptance criteria:
  - Users can open a reminders inbox from the protected shell
  - Available-now and resurfaced watchlist titles can appear as reminder items
  - Users can mark reminders read or dismiss them
  - Exact-group-watched titles do not produce misleading group reminders
- Test expectations:
  - Solo reminder generation coverage
  - Group reminder generation coverage
  - Reminder read and dismiss coverage
  - Protected reminder API coverage

## Epic 8: Combined Recommendation Engine

### Ticket 8.1: Create group taste profile service

- Priority: P0
- Goal: Aggregate multiple user taste profiles without losing individual boundaries.
- Scope:
  - Member overlap calculation
  - Shared genre/provider affinity
  - Conflict detection
- Acceptance criteria:
  - Group profile surfaces both overlap and conflict data
- Dependencies:
  - 7.1

### Ticket 8.2: Implement combined recommendation scoring

- Priority: P0
- Goal: Produce low-risk recommendations for selected household combinations.
- Scope:
  - Strong dislike penalty
  - Consensus boost
  - Safe-overlap ranking strategy
- Acceptance criteria:
  - Any selected member's dislike materially hurts a title
  - Shared preferences materially improve ranking
  - Group results do not overwrite solo state
- Test expectations:
  - Group recommendation happy-path test

## Epic 9: Settings, Provider Preferences, and Household Management

### Ticket 9.1: Build provider preference settings

- Priority: P1
- Goal: Let users prefer the services they actually have access to.
- Scope:
  - User settings page
  - Preferred provider selection
  - Settings persistence
- Acceptance criteria:
  - Preferred providers are stored and influence ranking

### Ticket 9.2: Build household management views

- Priority: P1
- Goal: Let the household inspect members and saved groups.
- Scope:
  - Household page
  - Member list
  - Saved group list
  - Invite management list
- Acceptance criteria:
  - Household members are visible
  - Saved groups can be reviewed and created
  - Invite status is visible

## Epic 10: Testing, Docs, Polish, and MVP Hardening

### Ticket 10.1: Add smoke and unit coverage for MVP flows

- Priority: P0
- Goal: Make the MVP credible to iterate on safely.
- Scope:
  - Playwright smoke tests
  - Vitest unit tests for recommendation, catalog normalization, and validation utilities
- Acceptance criteria:
  - Core happy paths are covered
  - Test scripts run locally

### Ticket 10.2: Finalize docs, demo data, and deployment notes

- Priority: P0
- Goal: Make the repo handoff-ready.
- Scope:
  - README
  - Seeded demo household users
  - Deferred work notes
  - Deployment/setup notes
- Acceptance criteria:
  - Repo explains how to run and what is intentionally deferred

## Suggested Execution Sequence

1. Epic 1
2. Epic 2
3. Epic 3
4. Epic 4
5. Epic 5
6. Epic 6
7. Epic 7
8. Epic 8
9. Epic 9
10. Epic 10
