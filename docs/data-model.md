# ScreenLantern Data Model

## Domain Goals

- Keep individual taste and history separate per user
- Support multiple members inside one household
- Allow saved recommendation groups
- Model shared planning intent separately from personal taste and shared watch history
- Persist enough state to power explainable solo and combined recommendations

## Core Entities

### User

- Authentication identity
- Profile metadata such as name and email
- Belongs to one household in MVP
- Carries a household role in MVP
- Uses a single-owner governance model in MVP+, where exactly one user in a household should hold `OWNER`
- Stores provider preferences and recommendation defaults
- Can own one Trakt connection row for personal history import

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
- Can represent manual or imported personal state depending on `sourceContext`
- Remains the single source of truth for personal taste and library state, whether it came from ScreenLantern or Trakt

### UserTraktConnection

- Persisted OAuth and sync metadata for one user's linked Trakt account
- Stores encrypted access and refresh tokens plus lightweight sync status fields
- Keeps import ownership strictly personal to the connected ScreenLantern user
- Tracks:
  - sync freshness mode
  - last attempted sync time
  - last successful sync time
  - last sync status
  - last sync trigger (`MANUAL` or `AUTOMATIC`)
  - compact last-sync summary JSON for user-facing review
    - imported counts for watched, watchlist, likes, and dislikes
    - cleared-count summary for imported rows removed to match Trakt
    - skipped unmatched-title count
    - a short recent-import preview
  - stored Trakt activity timestamps for delta sync planning
- Uses the same row for manual sync, opportunistic app-open sync, and future scheduler-triggered sync
- Does not store an unbounded sync-history log in MVP; Settings reads the compact last-sync summary instead

### AiConversation

- One persisted assistant thread per signed-in user in MVP
- Stores a lightweight transcript plus the last active recommendation context snapshot
- Keeps assistant memory user-owned and household-scoped without creating a full multi-thread chat system
- Exists to support refinement follow-ups such as “something lighter,” “only movies,” or “what about something we saved already?”
- Does not store raw provider entitlements, raw recommendation score traces, or cross-household data

### SharedWatchlistEntry

- Persisted shared planning row for one title, one saver, and one shared context
- Distinct from `UserTitleInteraction.WATCHLIST`
- Supports `GROUP` and `HOUSEHOLD` scope
- Records who saved the title and which shared context it belongs to
- Allows group resurfacing, reminders, and Library sections to reuse collaborative planning intent without mutating personal taste state

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

### UserReminderPreference

- One persisted reminder-tuning row per signed-in user
- Keeps reminder controls user-owned instead of shared across the household
- Stores category toggles, solo/group toggles, reminder pace, and dismissed-reminder reappearance policy

### HouseholdActivity

- Persisted collaborative-history row scoped to one household
- Captures who did something shared, what happened, when it happened, and optional title or context references
- Stores concise summary/detail copy for the Activity page without requiring a second rendering model
- Intentionally excludes private solo-only actions that were never meant to be shared

### Derived Title Fit Summary

- No dedicated table in MVP
- Computed on read from:
  - `UserTitleInteraction`
  - `SharedWatchlistEntry`
  - `GroupWatchSession`
  - per-user taste profiles derived from existing interactions and preferences
- Produces household-safe, non-technical fit states for detail-page transparency and lightweight card labels

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

### Trakt Connections

- `UserTraktConnection`
  - `id`
  - `userId`
  - `householdId`
  - `traktUserId`
  - `traktUsername`
  - `accessTokenEncrypted`
  - `refreshTokenEncrypted`
  - `expiresAt`
  - `scope`
  - `syncMode`
  - `lastActivitiesJson`
  - `lastSyncAttemptedAt`
  - `lastSyncedAt`
  - `lastSyncStatus`
  - `lastSyncError`
  - `createdAt`
  - `updatedAt`

### Assistant Conversation

- `AiConversation`
  - `id`
  - `userId`
  - `householdId`
  - `messagesJson`
  - `lastContextJson`
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
- `IMPORTED`

Imported mapping rules:

- Trakt watched history imports into `WATCHED`
- Trakt watchlist imports into `WATCHLIST`
- Trakt ratings map into:
  - `LIKE` for ratings `7-10`
  - `DISLIKE` for ratings `1-4`
  - no interaction for neutral ratings `5-6`
- Only previously imported rows are eligible for automatic clearing during later syncs
- Manual ScreenLantern interactions remain authoritative over imported state
- Source-aware UI reads `sourceContext` to label personal state as imported from Trakt or added in ScreenLantern
- Imported-state cleanup can remove only `IMPORTED` rows for one title and one user:
  - `watchlist` clears imported `WATCHLIST`
  - `watched` clears imported `WATCHED`
  - `taste` clears imported `LIKE` and `DISLIKE`
- Shared watchlist rows, household activity, and group watch sessions are unaffected by imported-state cleanup
- Automatic Trakt sync rules in MVP:
  - `OFF` disables automatic refresh
  - `DAILY` requires a first manual import, then refreshes when the last successful sync is older than one day
  - `ON_LOGIN_OR_APP_OPEN` can refresh more aggressively and can bootstrap the first import automatically
  - repeated automatic failures back off before retrying again

### Shared Watchlist Entries

- `SharedWatchlistEntry`
  - `id`
  - `householdId`
  - `titleCacheId`
  - `scope`
  - `contextKey`
  - `contextLabel`
  - `selectedUserIds`
  - `savedGroupId`
  - `savedById`
  - `createdAt`
  - `updatedAt`

Shared watchlist scopes:

- `GROUP`
- `HOUSEHOLD`

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

### Reminder Preferences

- `UserReminderPreference`
  - `id`
  - `userId`
  - `householdId`
  - `enableAvailableNow`
  - `enableWatchlistResurface`
  - `enableGroupWatchCandidate`
  - `enableSoloReminders`
  - `enableGroupReminders`
  - `aggressiveness`
  - `allowDismissedReappear`
  - `createdAt`
  - `updatedAt`

Reminder aggressiveness values:

- `LIGHT`
- `BALANCED`
- `PROACTIVE`

### Household Activity

- `HouseholdActivity`
  - `id`
  - `householdId`
  - `actorUserId` (optional)
  - `titleCacheId` (optional)
  - `type`
  - `contextLabel`
  - `summary`
  - `detail`
  - `metadataJson`
  - `createdAt`

Household activity types:

- `SHARED_SAVE_ADDED`
- `SHARED_SAVE_REMOVED`
- `GROUP_WATCH_RECORDED`
- `INVITE_CREATED`
- `INVITE_REVOKED`
- `INVITE_REDEEMED`
- `OWNERSHIP_TRANSFERRED`
- `MEMBER_REMOVED`

## Modeling Notes

- Separate rows per interaction type make state transitions easy to audit and query.
- `UserRecommendationContext` belongs to the signed-in user, not to the household as a shared singleton.
- Solo mode is represented as exactly one selected user id; group mode is represented as two or more selected user ids.
- If a saved group becomes invalid or stale, context resolution falls back to the viewer's solo profile and the stored row is normalized.
- Group watch sessions intentionally do not create personal `WATCHED` interactions for every participant.
- Personal watched history and shared watch history are related but distinct data sets.
- Shared watchlist entries are planning intent, not personal taste or watch-history state.
- Shared watchlist entries are keyed per saver, per context, and per title so multiple household members can independently save the same title into the same shared context.
- Solo recommendations stay grounded in personal state, while group resurfacing can reuse group-shared and household-shared planning entries.
- Cached TMDb metadata lets the UI reuse normalized title data without excessive refetching.
- `providerSnapshot` stores the latest normalized provider list for the configured watch region.
- `metadataJson` stores the broader normalized title payload, including provider status and detail-only fields.
- `lastSyncedAt` is used to reuse recent provider availability for roughly 12 hours and full detail payloads for roughly 24 hours in MVP.
- Reminder preferences are user-owned and household-safe because they are keyed to one signed-in user inside one household.
- Reminder pace only changes the volume of softer resurfacing reminders; it does not suppress `AVAILABLE_NOW` unless that category is disabled explicitly.
- Dismissed reminder reappearance is a fixed policy in MVP: if enabled, the same reminder can return after a 14-day cooldown when it still qualifies.
- Provider availability remains denormalized in MVP so the service layer can evolve without new join tables.
- Member removal preserves the account in MVP by moving the removed user into a new solo household instead of deleting the user.
- Ownership transfer does not require schema changes in MVP+; it is modeled by updating `User.householdRole` for the current owner and promoted member.
- Protected request helpers re-read the current user from the database so governance changes are reflected immediately even with JWT sessions.
- `UserReminder` is keyed by user, context, category, and title so the same title can appear differently in solo and group reminder states without collisions.
- Reminder rows are generated on demand from resurfacing logic, not from a scheduled notification pipeline.
- `readAt` and `dismissedAt` live on the reminder row and do not affect watchlist state.
- Cross-user fit summaries are intentionally derived instead of persisted so household comparison stays explainable and reuses the same solo/group recommendation primitives.
- Fit summaries can safely answer “who is this best for?” because they only compare members inside the signed-in user's current household.
- `HouseholdActivity` is intentionally limited to explicitly shared planning, watched-together, invite, and governance events.
- Personal watchlist saves, likes, dislikes, hides, and solo watched history remain private and do not create `HouseholdActivity` rows.
- Activity rows are filtered by `householdId` on the server, so collaborative history never crosses household boundaries.
- Rewatch tracking, group watch-session editing, and duplicate session history are deferred beyond MVP.
