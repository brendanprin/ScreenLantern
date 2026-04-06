import type { MediaTypeKey } from "@/lib/types";

export interface MockTraktProfile {
  userId: string;
  username: string;
}

export interface MockTraktActivitySet {
  movies: {
    watched_at?: string | null;
    rated_at?: string | null;
    watchlisted_at?: string | null;
  };
  shows: {
    watched_at?: string | null;
    rated_at?: string | null;
    watchlisted_at?: string | null;
  };
  episodes: {
    watched_at?: string | null;
  };
}

export interface MockTraktTitleItem {
  mediaType: MediaTypeKey;
  tmdbId: number;
  title: string;
  year?: number | null;
  watchedAt?: string | null;
  watchlistedAt?: string | null;
  ratedAt?: string | null;
  rating?: number | null;
}

function buildUsername(email: string) {
  return email.split("@")[0]?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() ?? "screenlantern-user";
}

export function getMockTraktProfile(email: string): MockTraktProfile {
  const username = buildUsername(email);

  return {
    userId: `mock-trakt-${username}`,
    username,
  };
}

export function getMockTraktActivities(email: string): MockTraktActivitySet {
  const username = buildUsername(email);

  return {
    movies: {
      watched_at: "2026-04-04T12:00:00.000Z",
      rated_at: "2026-04-04T12:05:00.000Z",
      watchlisted_at: "2026-04-04T12:10:00.000Z",
    },
    shows: {
      watched_at: "2026-04-04T12:15:00.000Z",
      rated_at: "2026-04-04T12:20:00.000Z",
      watchlisted_at: "2026-04-04T12:25:00.000Z",
    },
    episodes: {
      watched_at: username === "brendan" ? "2026-04-04T12:15:00.000Z" : null,
    },
  };
}

export function getMockTraktWatchedItems(email: string, mediaType: MediaTypeKey) {
  const username = buildUsername(email);

  if (username === "brendan") {
    return mediaType === "movie"
      ? [
          {
            mediaType: "movie" as const,
            tmdbId: 18,
            title: "Spider-Man: Into the Spider-Verse",
            year: 2018,
            watchedAt: "2026-04-04T12:00:00.000Z",
          },
        ]
      : [
          {
            mediaType: "tv" as const,
            tmdbId: 104,
            title: "Only Murders in the Building",
            year: 2021,
            watchedAt: "2026-04-04T12:15:00.000Z",
          },
        ];
  }

  if (username === "katie") {
    return mediaType === "movie"
      ? [
          {
            mediaType: "movie" as const,
            tmdbId: 15,
            title: "Palm Springs",
            year: 2020,
            watchedAt: "2026-04-04T12:00:00.000Z",
          },
        ]
      : [];
  }

  return [];
}

export function getMockTraktRatedItems(email: string, mediaType: MediaTypeKey) {
  const username = buildUsername(email);

  if (username === "brendan") {
    return mediaType === "movie"
      ? [
          {
            mediaType: "movie" as const,
            tmdbId: 15,
            title: "Palm Springs",
            year: 2020,
            rating: 8,
            ratedAt: "2026-04-04T12:05:00.000Z",
          },
        ]
      : [];
  }

  if (username === "geoff") {
    return mediaType === "tv"
      ? [
          {
            mediaType: "tv" as const,
            tmdbId: 103,
            title: "Severance",
            year: 2022,
            rating: 9,
            ratedAt: "2026-04-04T12:20:00.000Z",
          },
        ]
      : [];
  }

  return [];
}

export function getMockTraktWatchlistItems(email: string, mediaType: MediaTypeKey) {
  const username = buildUsername(email);

  if (username === "brendan") {
    return mediaType === "movie"
      ? []
      : [
          {
            mediaType: "tv" as const,
            tmdbId: 107,
            title: "Ted Lasso",
            year: 2020,
            watchlistedAt: "2026-04-04T12:25:00.000Z",
          },
        ];
  }

  if (username === "palmer") {
    return mediaType === "movie"
      ? [
          {
            mediaType: "movie" as const,
            tmdbId: 13,
            title: "Paddington 2",
            year: 2018,
            watchlistedAt: "2026-04-04T12:10:00.000Z",
          },
        ]
      : [];
  }

  return [];
}
