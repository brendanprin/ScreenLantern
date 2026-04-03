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

### Household Model

- Every user belongs to a household
- Household supports multiple members
- Household can save custom groups for repeat recommendation contexts
- Personal data remains scoped to the user

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

### Recommendations

- Solo recommendation feed for a user
- Combined recommendation feed for a selected group
- Deterministic and explainable MVP scoring

## UX Principles

- Keep the active context obvious at all times
- Optimize for quick scanning and quick action
- Keep the app polished but restrained
- Minimize navigation friction between home, search, browse, library, and household views
- Make solo and group recommendation modes feel first-class

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
- A demo household can be seeded locally with multiple members
- A user can search and browse TMDb-backed content
- A user can save and rate titles and see them reflected in their library
- A user can receive a useful solo recommendation feed
- A group of users can receive a combined recommendation feed that respects strong dislikes
- The codebase exposes clear service functions that a future AI layer could call
