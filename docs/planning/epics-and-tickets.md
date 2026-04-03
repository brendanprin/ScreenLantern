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
- Goal: Create a new household automatically when the first user signs up.
- Scope:
  - Registration form
  - Validation
  - Transactional creation of household and user
- Acceptance criteria:
  - Registering creates both a user and a household
  - Duplicate email is rejected cleanly
- Dependencies:
  - 2.1

## Epic 3: Household, Memberships, and Group Mode Foundation

### Ticket 3.1: Model households and household memberships

- Priority: P0
- Goal: Persist household structure cleanly.
- Scope:
  - Prisma models for household and membership relations
  - Session helpers for active household resolution
- Acceptance criteria:
  - Users can be resolved as household members
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

## Epic 4: TMDb Integration, Catalog Search, and Browse

### Ticket 4.1: Build TMDb service client and normalization layer

- Priority: P0
- Goal: Isolate external catalog access behind internal services.
- Scope:
  - Search endpoint integration
  - Discover endpoint integration
  - Genre/provider lookup helpers
  - Mapping to internal title DTOs
- Acceptance criteria:
  - Search and discover services return normalized results
  - TMDb-specific response details stay out of page components
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
- Acceptance criteria:
  - Household members are visible
  - Saved groups can be reviewed and created

## Epic 10: Testing, Docs, Polish, and MVP Hardening

### Ticket 10.1: Add smoke and unit coverage for MVP flows

- Priority: P0
- Goal: Make the MVP credible to iterate on safely.
- Scope:
  - Playwright smoke tests
  - Vitest unit tests for recommendation and validation utilities
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
