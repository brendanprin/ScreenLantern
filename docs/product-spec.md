# ScreenLantern Product Spec

## Overview

ScreenLantern is a household streaming discovery app designed to reduce decision fatigue. It helps people find movies and TV shows across streaming providers, keep personal taste data separate, and generate recommendations for one person or a selected group.

ScreenLantern does not stream content. Its responsibilities are discovery, organization, and recommendation support.

## Product Goals

- Help users quickly answer "what should we watch tonight?"
- Provide one place to search and browse titles across streaming services
- Preserve separate taste profiles for each household member
- Support shared recommendation contexts for custom household combinations
- Surface provider availability so users can decide where to watch
- Build an architecture that can later power an AI recommendation/chat layer

## Primary Users

- A single user trying to find something they will enjoy tonight
- A household member managing their own watchlist and history
- A pair or group of household members looking for a "safe overlap" title

## MVP Personas

- Brendan: likes thoughtful sci-fi, crime thrillers, and prestige TV
- Katie: likes smart dramas, feel-good picks, and strong reviews
- Palmer: likes action, animation, and easy-to-start titles
- Geoff: likes comedy, classics, and consensus crowd-pleasers

These demo personas exist to make local development and recommendation tuning easier. They are not hard-coded product constraints.

## Core Jobs To Be Done

1. Search for a movie or show and immediately see useful metadata plus where it is available.
2. Browse discover feeds with practical filters when the user does not know exactly what they want.
3. Save titles, mark watched, and express taste through like, dislike, or hide signals.
4. Switch between "me" mode and "group" mode without losing context.
5. Get a recommendation feed that feels meaningfully tailored for a person or selected group.

## MVP Features

### Authentication

- Email and password sign up
- Secure login and logout
- Protected application routes
- Persistent authenticated session
- Registration path for either creating a household or joining via invite

### Household Model

- Every user belongs to a household
- Household supports multiple members
- Household uses MVP roles: `OWNER` and `MEMBER`
- Owners can create invites and manage membership
- Households operate with one active owner at a time in MVP+
- Owners can transfer ownership to another household member with explicit confirmation
- Household can save custom groups for repeat recommendation contexts
- Personal data remains scoped to the user
- Member removal preserves the account by moving that user into a new solo household in MVP
- Active recommendation context is persisted per signed-in user and restored across sessions
- Solo context can target a single household member profile
- Group context can target either a saved group or an ad hoc member combination

### Catalog Search and Browse

- Search across movies and TV shows using TMDb
- Browse discover feeds
- Filter by media type, genre, release year, runtime, popularity, and provider when available
- Paginate results

### Title Details

- Poster and backdrop
- Summary, genres, runtime, year
- Cast where practical
- Seasons and episode counts for TV where practical
- Provider availability
- Personal actions: watchlist, watched, like, dislike, hide

### Personal Library

- Watchlist
- Watched history
- Likes
- Dislikes
- Hidden titles
- Personal watched history remains distinct from group watch sessions
- Watchlist items can be resurfaced on Home when they are practical to watch now or still fit the current context

### Recommendations

- Solo recommendation feed for a user
- Combined recommendation feed for a selected group
- Deterministic and explainable MVP scoring
- Each recommendation surfaces 1 to 3 concise explanation reasons
- Recommendation cards show a primary reason inline plus a lightweight “Why this?” affordance
- Solo explanations speak to personal taste, providers, runtime, and prior watch history
- Group explanations focus on safe overlap, shared-provider access, and whether the exact group has already watched a title together
- Invalid saved contexts fall back safely to the signed-in viewer's solo profile
- Home can include watchlist resurfacing lanes such as “Available now on your services” and “Back on your radar”
- “Available now” only applies when provider availability is known and a title matches the selected services in the configured watch region
- Unknown or missing provider data can still allow a title to resurface, but never as a positive “available now” match
- Group watchlist resurfacing uses titles saved by at least one selected member, but exact-group watch history suppresses stale group rewatches
- Group resurfacing treats those saved titles as individual watchlist intent, not as a permanent shared household watchlist

### Group Watch Sessions

- A title can be marked as watched by me or watched by current group
- Group watch sessions record:
  - household
  - title
  - participant set
  - optional saved group reference
  - creator
  - watched timestamp
- Group watch sessions do not directly overwrite each participant's solo watched history
- Recommendation services can treat prior group watches as a softer shared signal later without rewriting personal taste history

### Household Invites and Member Management

- Owner-created invite code and join-link flow
- Server-side invite validation and redemption
- Invite expiration plus inactive/redeemed handling
- Household member list with visible roles
- Current owner is explicitly surfaced in the household UI
- Invite listings remain visible across owner transfers
- The new owner can manage invites created before a transfer
- Prior owners are downgraded to members immediately after ownership transfer
- Safe member removal rules that avoid deleting accounts

## UX Principles

- Keep the active context obvious at all times
- Make it clear whether a watched action is personal or for the current group
- Optimize for quick scanning and quick action
- Keep the app polished but restrained
- Minimize navigation friction between home, search, browse, library, and household views
- Make solo and group recommendation modes feel first-class
- Make recommendation logic feel trustworthy without exposing raw score math
- Make ownership and invite authority legible without building a heavy admin system
- Make saved titles useful again without requiring users to remember what they already queued
- Make watchlist resurfacing feel practical now without needing notification infrastructure

## Non-Goals

- In-app video playback
- Streaming provider deep integrations
- Notifications
- Social follows or feeds
- Native mobile apps
- LLM chat or conversational search
- Highly complex machine-learned ranking systems

## Success Criteria For MVP

- A new user can sign up, sign in, and access protected app pages
- A new user can either create a household or join an existing one with a valid invite
- A demo household can be seeded locally with multiple members
- A household owner can safely transfer ownership to another member
- A user can search and browse TMDb-backed content
- A user can save and rate titles and see them reflected in their library
- A user can receive a useful solo recommendation feed
- A group of users can receive a combined recommendation feed that respects strong dislikes
- Returning users see their most recent valid recommendation context restored
- Group watch events can be recorded without mutating every participant's personal watched library
- Recommendation cards clearly explain why a title was surfaced in solo or group mode
- Saved watchlist titles can be resurfaced on Home when they are currently practical or still a good fit
- “Available now” resurfacing only promotes titles with known provider availability on selected services
- The codebase exposes clear service functions that a future AI layer could call
