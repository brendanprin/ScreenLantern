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
- Household membership model
- Saved household groups
- Search and discover flows using TMDb
- Title details with provider availability
- Personal library actions and views
- Solo recommendation feed
- Group recommendation feed
- Provider preference settings

### Quality

- Smoke coverage for auth and core happy paths
- Unit coverage for recommendation scoring and validation utilities
- Reasonable loading and empty states

## Explicitly Deferred

- Password reset and email verification
- OAuth providers
- Real-time presence or collaborative sessions
- Streaming service account sync
- Deep provider linking and watch intent handoff
- Rich recommendation explanations in UI
- AI chat assistant
- Native apps
- Offline mode

## MVP Acceptance Definition

The MVP is considered complete when:

- A developer can clone the repo, configure env vars, run migrations, and start the app locally
- A new user can register and use the protected application
- Household members can be modeled and switched between in demo mode
- Search, browse, details, and library actions work end to end
- Solo and combined recommendations produce stable, sensible results
- The repository contains product, architecture, and roadmap documentation
- The ticket breakdown is detailed enough to manage follow-on work
