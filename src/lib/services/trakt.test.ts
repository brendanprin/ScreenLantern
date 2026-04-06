import { InteractionType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildTraktAuthorizeUrl,
  determineTraktSyncPlan,
  mapTraktRatingToInteraction,
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
