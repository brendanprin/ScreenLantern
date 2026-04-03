# ScreenLantern Data Model

## Domain Goals

- Keep individual taste and history separate per user
- Support multiple members inside one household
- Allow saved recommendation groups
- Persist enough state to power explainable solo and combined recommendations

## Core Entities

### User

- Authentication identity
- Profile metadata such as name and email
- Belongs to one household in MVP
- Stores provider preferences and recommendation defaults

### Household

- Top-level container for related users
- Owns saved recommendation groups

### HouseholdMembership

- Associates users to a household
- Stores role metadata if needed later

### HouseholdGroup

- A saved set of household members for repeated group recommendations
- Example: "Movie Night Trio"

### HouseholdGroupMember

- Join table between a saved group and users

### TitleCache

- Local cached metadata for TMDb titles
- Stores media type, runtime, genres, poster, release info, and provider snapshot metadata

### UserTitleInteraction

- Typed interaction record between a user and a title
- Supports actions such as watchlist, watched, like, dislike, and hide
- Includes timestamps and optional context metadata

### RecommendationRun

- Stores a recommendation request context and result summary
- Supports solo or group mode
- Useful for QA, analytics, and future explanations

## Recommended Relational Shape

### Users and Households

- `Household`
  - `id`
  - `name`
  - `createdAt`
  - `updatedAt`
- `User`
  - `id`
  - `name`
  - `email`
  - `passwordHash`
  - `householdId`
  - `preferredProviders`
  - `defaultMediaType`
  - `createdAt`
  - `updatedAt`

### Saved Groups

- `HouseholdGroup`
  - `id`
  - `householdId`
  - `name`
  - `createdById`
  - `createdAt`
  - `updatedAt`
- `HouseholdGroupMember`
  - `groupId`
  - `userId`

### Title Metadata

- `TitleCache`
  - `id`
  - `tmdbId`
  - `mediaType`
  - `title`
  - `overview`
  - `posterPath`
  - `backdropPath`
  - `releaseDate`
  - `runtimeMinutes`
  - `genres`
  - `voteAverage`
  - `popularity`
  - `providerSnapshot`
  - `metadataJson`
  - `lastSyncedAt`

### Interactions

- `UserTitleInteraction`
  - `id`
  - `userId`
  - `titleCacheId`
  - `interactionType`
  - `sourceContext`
  - `groupRunId`
  - `createdAt`
  - `updatedAt`

Interaction types:

- `WATCHLIST`
- `WATCHED`
- `LIKE`
- `DISLIKE`
- `HIDE`

Source contexts:

- `SOLO`
- `GROUP`
- `MANUAL`

### Recommendation Runs

- `RecommendationRun`
  - `id`
  - `householdId`
  - `mode`
  - `requestedById`
  - `selectedUserIds`
  - `filtersJson`
  - `resultTitleIds`
  - `explanationJson`
  - `createdAt`

Modes:

- `SOLO`
- `GROUP`

## Modeling Notes

- Separate rows per interaction type make state transitions easy to audit and query.
- Group watch events can be represented as multiple user interactions tied to one `RecommendationRun` or future `WatchSession`.
- Cached TMDb metadata lets the UI reuse normalized title data without excessive refetching.
- Provider availability can live in `providerSnapshot` JSON in MVP, then be normalized later if needed.
