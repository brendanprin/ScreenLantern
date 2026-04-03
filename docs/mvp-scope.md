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
- Live TMDb hardening with normalization, provider caching, and graceful fallback states
- Personal library actions and views
- Solo recommendation feed
- Group recommendation feed
- Recommendation explanation surfacing on the main Home / For You feed
- Watchlist resurfacing lanes for `Available now on your services` and `Back on your radar`
- Group watch-session modeling separate from personal watched history
- Provider preference settings

### Quality

- Smoke coverage for auth and core happy paths
- Unit coverage for recommendation scoring, catalog normalization, and validation utilities
- Reasonable loading and empty states
- Regression coverage for explanation generation and rendering

## Explicitly Deferred

- Password reset and email verification
- OAuth providers
- Full role editing beyond single-owner transfer
- Email delivery for invites
- Real-time presence or collaborative sessions
- Streaming service account sync
- Deep provider linking and watch intent handoff
- Background TMDb refresh jobs and sophisticated cache invalidation
- Push or email notifications for watchlist availability changes
- Cross-region provider reconciliation beyond one configured watch region
- AI chat assistant
- Native apps
- Offline mode
- Group watch-session editing, deduplication, and shared activity feed
- Deep recommendation-debug dashboards and explanation timelines

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
- Shared watch events can be recorded without rewriting every participant's solo watched history
- The repository contains product, architecture, and roadmap documentation
- The ticket breakdown is detailed enough to manage follow-on work
