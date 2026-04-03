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
- Carries a household role in MVP
- Uses a single-owner governance model in MVP+, where exactly one user in a household should hold `OWNER`
- Stores provider preferences and recommendation defaults

### Household

- Top-level container for related users
- Owns saved recommendation groups

### HouseholdMembership

In the current MVP implementation, membership is represented directly on the `User` row via `householdId` and `householdRole`.

### HouseholdInvite

- Single-use invite for joining an existing household
- Created by an owner
- Has expiration plus redeemed/revoked state
- Assigns the joining user a role, currently `MEMBER`
- Remains household-scoped after owner transfer, so a new owner can still view and revoke older invites

### HouseholdGroup

- A saved set of household members for repeated group recommendations
- Example: "Movie Night Trio"

### HouseholdGroupMember

- Join table between a saved group and users

### UserRecommendationContext

- One persisted recommendation context per signed-in user
- Stores the last valid solo or group context for restoration across sessions and devices
- Can point at a saved group or store an ad hoc member set

### TitleCache

- Local cached metadata for TMDb titles
- Stores media type, runtime, genres, poster, release info, and provider snapshot metadata
- `lastSyncedAt` is used as an MVP freshness marker for provider and detail reuse

### UserTitleInteraction

- Typed interaction record between a user and a title
- Supports actions such as watchlist, watched, like, dislike, and hide
- Includes timestamps and optional context metadata

### RecommendationRun

- Stores a recommendation request context and result summary
- Supports solo or group mode
- Useful for QA, analytics, and future explanations

### GroupWatchSession

- Records that a specific household combination watched a specific title together
- Stores the participant set distinctly from personal watched interactions
- Preserves a future-friendly shared-watch signal for recommendations and AI features

### UserReminder

- Persisted in-app reminder row for one signed-in user and one resolved recommendation context
- Stores lightweight reminder state such as active, read, and dismissed
- Uses reminder categories for available-now, watchlist resurfacing, and group-watch candidates
- Carries explanation text for reuse in the reminder inbox UI

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
  - `householdRole`
  - `preferredProviders`
  - `defaultMediaType`
  - `createdAt`
  - `updatedAt`

### Household Invites

- `HouseholdInvite`
  - `id`
  - `householdId`
  - `createdById`
  - `redeemedById`
  - `code`
  - `role`
  - `expiresAt`
  - `redeemedAt`
  - `revokedAt`
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

### Persisted Recommendation Context

- `UserRecommendationContext`
  - `id`
  - `userId`
  - `householdId`
  - `mode`
  - `selectedUserIds`
  - `savedGroupId`
  - `createdAt`
  - `updatedAt`

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

### Group Watch Sessions

- `GroupWatchSession`
  - `id`
  - `householdId`
  - `titleCacheId`
  - `createdById`
  - `savedGroupId`
  - `participantKey`
  - `participantUserIds`
  - `watchedAt`
  - `createdAt`

### In-App Reminders

- `UserReminder`
  - `id`
  - `userId`
  - `householdId`
  - `titleCacheId`
  - `mode`
  - `category`
  - `contextKey`
  - `contextLabel`
  - `selectedUserIds`
  - `savedGroupId`
  - `summary`
  - `detail`
  - `explanationJson`
  - `isActive`
  - `readAt`
  - `dismissedAt`
  - `createdAt`
  - `updatedAt`

Reminder categories:

- `AVAILABLE_NOW`
- `WATCHLIST_RESURFACE`
- `GROUP_WATCH_CANDIDATE`

## Modeling Notes

- Separate rows per interaction type make state transitions easy to audit and query.
- `UserRecommendationContext` belongs to the signed-in user, not to the household as a shared singleton.
- Solo mode is represented as exactly one selected user id; group mode is represented as two or more selected user ids.
- If a saved group becomes invalid or stale, context resolution falls back to the viewer's solo profile and the stored row is normalized.
- Group watch sessions intentionally do not create personal `WATCHED` interactions for every participant.
- Personal watched history and shared watch history are related but distinct data sets.
- Cached TMDb metadata lets the UI reuse normalized title data without excessive refetching.
- `providerSnapshot` stores the latest normalized provider list for the configured watch region.
- `metadataJson` stores the broader normalized title payload, including provider status and detail-only fields.
- `lastSyncedAt` is used to reuse recent provider availability for roughly 12 hours and full detail payloads for roughly 24 hours in MVP.
- Provider availability remains denormalized in MVP so the service layer can evolve without new join tables.
- Member removal preserves the account in MVP by moving the removed user into a new solo household instead of deleting the user.
- Ownership transfer does not require schema changes in MVP+; it is modeled by updating `User.householdRole` for the current owner and promoted member.
- Protected request helpers re-read the current user from the database so governance changes are reflected immediately even with JWT sessions.
- `UserReminder` is keyed by user, context, category, and title so the same title can appear differently in solo and group reminder states without collisions.
- Reminder rows are generated on demand from resurfacing logic, not from a scheduled notification pipeline.
- `readAt` and `dismissedAt` live on the reminder row and do not affect watchlist state.
- Rewatch tracking, group watch-session editing, and duplicate session history are deferred beyond MVP.
