# ScreenLantern MVP Scope

## In Scope

### Foundation

- Next.js application scaffold
- Prisma schema and initial migrations
- Auth.js credentials auth
- Seed script and local developer demo data
- Core setup docs and environment template

### Product Capabilities

- User registration, sign in, sign out
- Household creation and join-via-invite onboarding
- Household owner/member role model
- Owner transfer and clearer household governance controls
- Household invite creation, redemption, and revocation
- Membership listing and safe member removal
- Saved household groups
- Server-persisted recommendation context restoration
- Search and discover flows using TMDb
- Title details with provider availability
- Streaming-service handoff with honest `Open in service` actions where reliable provider destinations exist
- Trakt account linking with manual import plus configurable automatic freshness for personal watched history, ratings, and watchlist
- Live TMDb hardening with normalization, provider caching, and graceful fallback states
- Personal library actions and views
- Solo recommendation feed
- Group recommendation feed
- Recommendation explanation surfacing on the main Home / For You feed
- Watchlist resurfacing lanes for `Available now on your services` and `Back on your radar`
- In-app reminders inbox with read/dismiss state for current-context resurfaced titles
- Reminder preferences for category toggles, solo/group gating, resurfacing pace, and dismissed-reminder reappearance
- Context-aware Library decision workspace with smart sections, provider-aware badges, lightweight filters, and quick triage actions
- Shared watchlist semantics for personal, group, and household planning intent
- Group watch-session modeling separate from personal watched history
- Cross-user fit summaries and household signal rows on title detail
- Household activity/history feed for collaborative planning and governance events
- Provider preference settings

### Quality

- Smoke coverage for auth and core happy paths
- Unit coverage for recommendation scoring, catalog normalization, and validation utilities
- Reasonable loading and empty states
- Regression coverage for explanation generation and rendering

## Explicitly Deferred

- Password reset and email verification
- General sign-in OAuth providers
- Full role editing beyond single-owner transfer
- Email delivery for invites
- Real-time presence or collaborative sessions
- Direct streaming-service account sync beyond Trakt
- Deep provider linking and watch intent handoff
- Full background-job or cron infrastructure for Trakt sync beyond the built-in opportunistic and internal trigger paths
- Background TMDb refresh jobs and sophisticated cache invalidation
- Push or email notifications for watchlist availability changes
- Background or scheduled reminder generation infrastructure
- Shared household reminder settings, digest schedules, and custom cooldown controls
- Shared-watchlist comments, reactions, or chat-style collaboration
- Activity reactions, comments, per-title discussion threads, and richer activity filtering
- Cross-region provider reconciliation beyond one configured watch region
- Streaming-provider account linking, entitlement sync, and broad deep-link support across every streaming service
- Advanced faceted Library search and bulk cleanup workflows
- AI chat assistant
- Native apps
- Offline mode
- Group watch-session editing and richer shared-history controls
- Deep recommendation-debug dashboards and explanation timelines

## MVP Shipped Focus

- The shipped MVP is centered on one loop:
  - search or browse
  - evaluate on title detail
  - save or compare in the right context
  - open in service
- Primary decision surfaces:
  - Home
  - Title Detail
  - Library
- Supporting surfaces:
  - Search
  - Browse
  - Reminders
  - Activity
- Search and Browse stay intentionally lighter so users are not asked to manage every action from every card.
- Reminders and Activity stay useful, but they are intentionally de-emphasized compared with the core discovery-to-handoff flow.

## MVP Acceptance Definition

The MVP is considered complete when:

- A developer can clone the repo, configure env vars, run migrations, and start the app locally
- A new user can register and use the protected application
- A new user can join an existing household via invite
- A household owner can transfer ownership safely to another member
- Household members can be modeled and switched between in demo mode
- Active recommendation context restores safely across refreshes and sessions
- Search, browse, details, and library actions work end to end
- Solo and combined recommendations produce stable, sensible results
- Recommendation cards explain why a title was selected without overwhelming the feed
- Home resurfacing lanes use watchlist and provider signals without treating unknown provider data as a positive match
- The reminders inbox reuses resurfacing logic and keeps solo and group reminder state distinct
- Reminder generation respects user-owned category toggles, solo/group settings, and resurfacing pace
- The Library helps users decide what to watch now with context-aware sections, provider-aware badges, and quick triage actions
- Group Library views suppress exact-group watched titles from fresh shared-candidate sections
- Users can intentionally save a title for themself, the active group, or the household without collapsing those states together
- Group resurfacing and reminders can reuse shared watchlist planning intent with clear context labels
- Shared watch events can be recorded without rewriting every participant's solo watched history
- Title detail can explain who a title is best for, where likely group conflict exists, and who already signaled interest without exposing raw scoring math
- Household members can review recent collaborative saves, watched-together moments, invite events, and governance changes in a household-safe activity feed
- The app can surface honest `Open in service` actions on detail and key card surfaces, while falling back gracefully when provider availability exists without a supported handoff URL
- A signed-in user can connect Trakt, manually sync personal watched history, ratings, and watchlist, and keep those imports personal to their own profile
- Later Trakt syncs are idempotent and do not repeatedly duplicate imported interactions
- A signed-in user can choose `Off`, `Daily`, or `On sign in or app open` Trakt freshness modes in Settings
- Opportunistic Trakt sync on app open can refresh stale personal history without creating duplicate imported rows or overwriting manual ScreenLantern state
- Source-aware personal state is visible on Title Detail and lightweight Library collection views so users can tell what came from Trakt versus ScreenLantern
- A signed-in user can clear imported watched, watchlist, or rating-derived taste state for one title without removing manual ScreenLantern state
- Settings shows a compact last-sync review so users can tell whether the last Trakt sync was manual or automatic, whether anything changed, and which recent titles were imported
- The repository contains product, architecture, and roadmap documentation
- The ticket breakdown is detailed enough to manage follow-on work

## Post-MVP Scope Next

- Broader streaming-provider handoff coverage and direct-provider account-linking exploration
- Push or email reminder delivery on top of the existing in-app reminder model
- More advanced Library cleanup tools, faceted exploration, and bulk actions
- Richer collaborative activity filtering and deeper shared-planning controls
- Scheduled Trakt refresh jobs and bulk import-management controls

## Release-Readiness Notes

- A production-style MVP check should run with live TMDb configuration, not silent mock-only assumptions.
- Settings should make mock versus live catalog mode explicit to developers and reviewers.
- Settings should also make Trakt live versus mock import mode explicit, and missing Trakt OAuth config should degrade into a clear disabled state.
- Settings should clearly show last successful sync time, last attempted sync time, sync freshness mode, and whether imported data may be stale.
- Settings should show last-sync review states that are calm and user-facing: changed imports, no changes found, or reconnect/retry guidance after failures.
- Settings should clearly explain that disconnect stops future syncs but keeps already imported personal data until the user clears or changes it manually.
- The future scheduler hook should stay protected behind an internal secret and should reuse the same sync service as manual and app-open sync.
- Smoke coverage should prioritize the core path:
  - auth
  - context switch
  - search
  - detail
  - save
  - open in service
  - Trakt link and manual sync
