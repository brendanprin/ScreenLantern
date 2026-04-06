import { InteractionType, TraktSyncStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildTraktSyncReview,
  buildTraktAuthorizeUrl,
  determineTraktSyncPlan,
  getTraktFreshnessState,
  mapTraktRatingToInteraction,
  shouldAutoSyncTraktConnection,
} from "@/lib/services/trakt";

describe("buildTraktAuthorizeUrl", () => {
  it("builds a standard OAuth authorize URL with state", () => {
    const url = new URL(buildTraktAuthorizeUrl("state-123"));

    expect(url.origin).toBe("https://trakt.tv");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
  });
});

describe("mapTraktRatingToInteraction", () => {
  it("maps strong positive Trakt ratings into likes", () => {
    expect(mapTraktRatingToInteraction(8)).toBe(InteractionType.LIKE);
  });

  it("maps strong negative Trakt ratings into dislikes", () => {
    expect(mapTraktRatingToInteraction(3)).toBe(InteractionType.DISLIKE);
  });

  it("keeps middling ratings neutral", () => {
    expect(mapTraktRatingToInteraction(6)).toBeNull();
  });
});

describe("determineTraktSyncPlan", () => {
  it("runs a full import when no prior Trakt activities have been stored", () => {
    const plan = determineTraktSyncPlan({
      currentActivities: {
        movies: {
          watched_at: "2026-04-04T12:00:00.000Z",
        },
      },
      previousActivities: null,
    });

    expect(plan).toEqual({
      watchedMovies: true,
      watchedShows: true,
      ratingsMovies: true,
      ratingsShows: true,
      watchlistMovies: true,
      watchlistShows: true,
    });
  });

  it("syncs only the Trakt categories whose activity timestamps changed", () => {
    const plan = determineTraktSyncPlan({
      currentActivities: {
        movies: {
          watched_at: "2026-04-04T12:00:00.000Z",
          rated_at: "2026-04-04T12:05:00.000Z",
        },
        shows: {
          watchlisted_at: "2026-04-04T12:10:00.000Z",
        },
        episodes: {
          watched_at: "2026-04-04T12:15:00.000Z",
        },
      },
      previousActivities: {
        movies: {
          watched_at: "2026-04-04T12:00:00.000Z",
          rated_at: "2026-04-03T12:05:00.000Z",
        },
        shows: {
          watchlisted_at: "2026-04-03T12:10:00.000Z",
        },
        episodes: {
          watched_at: "2026-04-03T12:15:00.000Z",
        },
      },
    });

    expect(plan).toEqual({
      watchedMovies: false,
      watchedShows: true,
      ratingsMovies: true,
      ratingsShows: false,
      watchlistMovies: false,
      watchlistShows: true,
    });
  });
});

describe("getTraktFreshnessState", () => {
  it("treats daily sync without an initial import as never synced", () => {
    const freshness = getTraktFreshnessState({
      syncMode: "DAILY",
      lastSyncedAt: null,
      lastSyncStatus: null,
      now: new Date("2026-04-06T12:00:00.000Z"),
    });

    expect(freshness.state).toBe("NEVER_SYNCED");
  });

  it("treats app-open sync as stale when the last import is beyond the freshness window", () => {
    const freshness = getTraktFreshnessState({
      syncMode: "ON_LOGIN_OR_APP_OPEN",
      lastSyncedAt: new Date("2026-04-05T23:00:00.000Z"),
      lastSyncStatus: TraktSyncStatus.SUCCESS,
      now: new Date("2026-04-06T12:00:00.000Z"),
    });

    expect(freshness.state).toBe("STALE");
  });
});

describe("shouldAutoSyncTraktConnection", () => {
  it("requires a manual bootstrap before daily automatic sync starts", () => {
    const decision = shouldAutoSyncTraktConnection({
      syncMode: "DAILY",
      lastSyncedAt: null,
      lastSyncAttemptedAt: null,
      lastSyncStatus: null,
      now: new Date("2026-04-06T12:00:00.000Z"),
    });

    expect(decision).toEqual({
      shouldSync: false,
      reason: "manual_bootstrap_required",
    });
  });

  it("allows app-open sync to run before the first successful import", () => {
    const decision = shouldAutoSyncTraktConnection({
      syncMode: "ON_LOGIN_OR_APP_OPEN",
      lastSyncedAt: null,
      lastSyncAttemptedAt: null,
      lastSyncStatus: null,
      now: new Date("2026-04-06T12:00:00.000Z"),
    });

    expect(decision).toEqual({
      shouldSync: true,
      reason: "never_synced",
    });
  });

  it("backs off repeated automatic retries after a recent failure", () => {
    const decision = shouldAutoSyncTraktConnection({
      syncMode: "ON_LOGIN_OR_APP_OPEN",
      lastSyncedAt: new Date("2026-04-05T00:00:00.000Z"),
      lastSyncAttemptedAt: new Date("2026-04-06T10:30:00.000Z"),
      lastSyncStatus: TraktSyncStatus.ERROR,
      now: new Date("2026-04-06T12:00:00.000Z"),
    });

    expect(decision).toEqual({
      shouldSync: false,
      reason: "backoff",
    });
  });

  it("stops automatic sync attempts when reconnect is required", () => {
    const decision = shouldAutoSyncTraktConnection({
      syncMode: "ON_LOGIN_OR_APP_OPEN",
      lastSyncedAt: new Date("2026-04-05T00:00:00.000Z"),
      lastSyncAttemptedAt: new Date("2026-04-06T09:00:00.000Z"),
      lastSyncStatus: TraktSyncStatus.NEEDS_REAUTH,
      now: new Date("2026-04-06T12:00:00.000Z"),
    });

    expect(decision).toEqual({
      shouldSync: false,
      reason: "needs_reauth",
    });
  });
});

describe("buildTraktSyncReview", () => {
  it("summarizes successful manual imports with recent title previews", () => {
    const review = buildTraktSyncReview({
      lastSyncStatus: TraktSyncStatus.SUCCESS,
      lastSyncTrigger: "MANUAL",
      lastSyncSummary: {
        trigger: "MANUAL",
        changed: true,
        imported: {
          watched: 2,
          watchlist: 1,
          likes: 1,
          dislikes: 0,
        },
        cleared: {
          watched: 0,
          watchlist: 0,
          ratings: 0,
        },
        skippedWithoutTmdb: 1,
        recentImports: [
          {
            tmdbId: 18,
            mediaType: "movie",
            title: "Spider-Man: Into the Spider-Verse",
            kind: "WATCHED",
            importedAt: "2026-04-06T12:00:00.000Z",
          },
        ],
      },
    });

    expect(review?.state).toBe("success");
    expect(review?.triggerLabel).toBe("Manual sync");
    expect(review?.headline).toContain("Imported 2 watched titles");
    expect(review?.headline).toContain("1 watchlist item");
    expect(review?.headline).toContain("1 rating");
    expect(review?.skippedNote).toContain("Skipped 1 title");
    expect(review?.recentImports).toHaveLength(1);
  });

  it("surfaces no-change automatic syncs clearly", () => {
    const review = buildTraktSyncReview({
      lastSyncStatus: TraktSyncStatus.SUCCESS,
      lastSyncTrigger: "AUTOMATIC",
      lastSyncSummary: {
        trigger: "AUTOMATIC",
        changed: false,
        imported: {
          watched: 0,
          watchlist: 0,
          likes: 0,
          dislikes: 0,
        },
        cleared: {
          watched: 0,
          watchlist: 0,
          ratings: 0,
        },
        skippedWithoutTmdb: 0,
        recentImports: [],
      },
    });

    expect(review).toEqual({
      state: "no_changes",
      triggerLabel: "Automatic sync",
      headline: "No new Trakt changes found.",
      detail:
        "ScreenLantern did not need to update your imported watched history, ratings, or watchlist on the last sync.",
      skippedNote: null,
      recentImports: [],
    });
  });

  it("gives reconnect guidance when the last sync needs reauthorization", () => {
    const review = buildTraktSyncReview({
      lastSyncStatus: TraktSyncStatus.NEEDS_REAUTH,
      lastSyncTrigger: "AUTOMATIC",
      lastSyncError: "Trakt authorization expired. Please reconnect.",
      lastSyncSummary: null,
    });

    expect(review?.state).toBe("failed");
    expect(review?.headline).toBe("Sync failed. Reconnect Trakt to continue.");
    expect(review?.triggerLabel).toBe("Automatic sync");
  });
});
