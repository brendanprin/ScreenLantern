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

### Data Layer

- PostgreSQL stores users, households, groups, interactions, preferences, cached metadata, and recommendation runs
- Prisma provides typed database access
- TMDb metadata is normalized into internal service types before UI consumption

## Key Design Decisions

### Household-First Domain Model

Every user belongs to a household. Personal state remains user-scoped, while saved recommendation groups are household-scoped. This keeps individual taste data distinct from shared contexts.

### Interaction-Centric Taste Modeling

Instead of building separate tables for every library bucket, ScreenLantern records user-title interactions with typed signals such as watchlist, watched, like, dislike, and hide. This simplifies storage, auditing, and future recommendation tuning.

### Provider Abstraction

TMDb is the initial source, but catalog access flows through internal services so providers can later be swapped or augmented with Watchmode, Trakt, or other APIs.

### Recommendation Engine as a Service

Recommendation logic is isolated behind `getRecommendedTitles`, `getUserTasteProfile`, and `getGroupTasteProfile`. The UI does not directly encode ranking logic.

## Request Flows

### Auth Flow

1. User submits email, password, and profile details.
2. Server validates input and hashes password with bcrypt.
3. User, household membership, and initial household are created.
4. Auth.js establishes a session.
5. Protected routes verify the session server-side.

### Catalog Search Flow

1. User submits search or filter parameters.
2. Server validates query params with Zod.
3. Catalog service queries TMDb and normalizes response shape.
4. Selected title metadata may be cached locally.
5. UI renders normalized cards with provider and interaction state overlays.

### Personal Interaction Flow

1. User triggers watchlist, watched, like, dislike, or hide.
2. Mutation validates session and household authorization.
3. Interaction service upserts the user-title interaction set.
4. Recommendation profile and cached counts are refreshed on read, not via background jobs in MVP.

### Group Recommendation Flow

1. User selects a household group or ad hoc member combination.
2. Server verifies all selected members belong to the same household.
3. Group taste profile is computed from each member's interactions and preferences.
4. Candidate titles are fetched from TMDb discover/search seeds.
5. Combined scoring applies overlap boosts and strong-dislike penalties.
6. Recommendation run metadata is stored for later debugging and AI explainability.

## Data Boundaries

- Auth and household authorization are enforced on the server
- Personal interactions are always tied to a single user
- Saved groups only reference members inside one household
- Group recommendation runs never overwrite solo user state

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

## Deferred Architectural Concerns

- Background job queue for metadata refresh
- Advanced cache invalidation and incremental sync
- Event streaming for interaction analytics
- External provider preference sync
- Explanation generation for recommendation rationale
