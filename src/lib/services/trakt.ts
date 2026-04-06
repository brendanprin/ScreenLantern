import { InteractionType, MediaType, Prisma, SourceContext, TraktSyncStatus } from "@prisma/client";

import { env } from "@/lib/env";
import {
  getMockTraktActivities,
  getMockTraktProfile,
  getMockTraktRatedItems,
  getMockTraktWatchlistItems,
  getMockTraktWatchedItems,
  type MockTraktActivitySet,
  type MockTraktTitleItem,
} from "@/lib/mock-trakt";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/token-crypto";
import { getTitleDetails } from "@/lib/services/catalog";
import { upsertTitleCache } from "@/lib/services/title-cache";
import type {
  MediaTypeKey,
  TraktConnectionSummary,
  TraktSyncResult,
} from "@/lib/types";

const TRAKT_AUTHORIZE_URL = "https://trakt.tv/oauth/authorize";
const TRAKT_TOKEN_URL = "https://api.trakt.tv/oauth/token";
const TRAKT_REVOKE_URL = "https://api.trakt.tv/oauth/revoke";
const TRAKT_API_BASE_URL = "https://api.trakt.tv";
export const TRAKT_OAUTH_STATE_COOKIE = "screenlantern-trakt-oauth-state";
export const TRAKT_POSITIVE_RATING_MIN = 7;
export const TRAKT_NEGATIVE_RATING_MAX = 4;

interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at?: number;
  scope?: string;
  token_type?: string;
}

interface TraktViewerProfile {
  username?: string | null;
  ids?: {
    slug?: string | null;
    trakt?: number | string | null;
  };
}

interface TraktLastActivities {
  movies?: {
    watched_at?: string | null;
    rated_at?: string | null;
    watchlisted_at?: string | null;
  };
  shows?: {
    watched_at?: string | null;
    rated_at?: string | null;
    watchlisted_at?: string | null;
  };
  episodes?: {
    watched_at?: string | null;
  };
}

interface TraktMovieEnvelope {
  watched_at?: string | null;
  listed_at?: string | null;
  rated_at?: string | null;
  rating?: number | null;
  movie?: {
    title?: string | null;
    year?: number | null;
    ids?: {
      tmdb?: number | null;
    };
  };
}

interface TraktShowEnvelope {
  watched_at?: string | null;
  listed_at?: string | null;
  rated_at?: string | null;
  rating?: number | null;
  show?: {
    title?: string | null;
    year?: number | null;
    ids?: {
      tmdb?: number | null;
    };
  };
}

export interface TraktSyncPlan {
  watchedMovies: boolean;
  watchedShows: boolean;
  ratingsMovies: boolean;
  ratingsShows: boolean;
  watchlistMovies: boolean;
  watchlistShows: boolean;
}

function traktConfigured() {
  return Boolean(env.traktUseMockData || (env.traktClientId && env.traktClientSecret));
}

function buildTraktHeaders(accessToken?: string) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "trakt-api-version": "2",
  });

  if (env.traktClientId) {
    headers.set("trakt-api-key", env.traktClientId);
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return headers;
}

function getTokenExpiresAt(payload: TraktTokenResponse) {
  const createdAtMs = payload.created_at ? payload.created_at * 1000 : Date.now();
  return new Date(createdAtMs + payload.expires_in * 1000);
}

function safeIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function compareActivityTimestamps(current?: string | null, previous?: string | null) {
  if (!previous) {
    return Boolean(current);
  }

  return Boolean(current && current !== previous);
}

function hasAnyActivity(payload: TraktLastActivities | null) {
  return Boolean(
    payload?.movies?.watched_at ||
      payload?.movies?.rated_at ||
      payload?.movies?.watchlisted_at ||
      payload?.shows?.watched_at ||
      payload?.shows?.rated_at ||
      payload?.shows?.watchlisted_at ||
      payload?.episodes?.watched_at,
  );
}

export function buildTraktAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.traktClientId ?? "mock-trakt-client",
    redirect_uri: env.traktRedirectUri,
    state,
  });

  return `${TRAKT_AUTHORIZE_URL}?${params.toString()}`;
}

export function mapTraktRatingToInteraction(rating?: number | null) {
  if (typeof rating !== "number") {
    return null;
  }

  if (rating >= TRAKT_POSITIVE_RATING_MIN) {
    return InteractionType.LIKE;
  }

  if (rating <= TRAKT_NEGATIVE_RATING_MAX) {
    return InteractionType.DISLIKE;
  }

  return null;
}

export function determineTraktSyncPlan(args: {
  currentActivities: TraktLastActivities | null;
  previousActivities: TraktLastActivities | null;
}) : TraktSyncPlan {
  if (!args.previousActivities || !hasAnyActivity(args.previousActivities)) {
    return {
      watchedMovies: true,
      watchedShows: true,
      ratingsMovies: true,
      ratingsShows: true,
      watchlistMovies: true,
      watchlistShows: true,
    };
  }

  return {
    watchedMovies: compareActivityTimestamps(
      args.currentActivities?.movies?.watched_at,
      args.previousActivities.movies?.watched_at,
    ),
    watchedShows:
      compareActivityTimestamps(
        args.currentActivities?.shows?.watched_at,
        args.previousActivities.shows?.watched_at,
      ) ||
      compareActivityTimestamps(
        args.currentActivities?.episodes?.watched_at,
        args.previousActivities.episodes?.watched_at,
      ),
    ratingsMovies: compareActivityTimestamps(
      args.currentActivities?.movies?.rated_at,
      args.previousActivities.movies?.rated_at,
    ),
    ratingsShows: compareActivityTimestamps(
      args.currentActivities?.shows?.rated_at,
      args.previousActivities.shows?.rated_at,
    ),
    watchlistMovies: compareActivityTimestamps(
      args.currentActivities?.movies?.watchlisted_at,
      args.previousActivities.movies?.watchlisted_at,
    ),
    watchlistShows: compareActivityTimestamps(
      args.currentActivities?.shows?.watchlisted_at,
      args.previousActivities.shows?.watchlisted_at,
    ),
  };
}

function parseStoredActivities(json: Prisma.JsonValue | null): TraktLastActivities | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return null;
  }

  return json as unknown as TraktLastActivities;
}

async function traktFetchJson<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const response = await fetch(`${TRAKT_API_BASE_URL}${path}`, {
    headers: buildTraktHeaders(accessToken),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new Error("Trakt authorization expired. Please reconnect your account.");
  }

  if (!response.ok) {
    throw new Error(`Trakt request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function exchangeTraktCode(code: string): Promise<TraktTokenResponse> {
  if (env.traktUseMockData) {
    return {
      access_token: `mock-access-${code}`,
      refresh_token: `mock-refresh-${code}`,
      expires_in: 60 * 60 * 24,
      created_at: Math.floor(Date.now() / 1000),
      scope: "public",
      token_type: "Bearer",
    };
  }

  if (!env.traktClientId || !env.traktClientSecret) {
    throw new Error("Trakt OAuth is not configured.");
  }

  const response = await fetch(TRAKT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      client_id: env.traktClientId,
      client_secret: env.traktClientSecret,
      redirect_uri: env.traktRedirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to complete the Trakt authorization exchange.");
  }

  return (await response.json()) as TraktTokenResponse;
}

async function refreshTraktToken(refreshToken: string): Promise<TraktTokenResponse> {
  if (env.traktUseMockData) {
    return {
      access_token: `mock-access-refresh-${Date.now()}`,
      refresh_token: refreshToken,
      expires_in: 60 * 60 * 24,
      created_at: Math.floor(Date.now() / 1000),
      scope: "public",
      token_type: "Bearer",
    };
  }

  if (!env.traktClientId || !env.traktClientSecret) {
    throw new Error("Trakt OAuth is not configured.");
  }

  const response = await fetch(TRAKT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: env.traktClientId,
      client_secret: env.traktClientSecret,
      redirect_uri: env.traktRedirectUri,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to refresh the Trakt access token.");
  }

  return (await response.json()) as TraktTokenResponse;
}

async function revokeTraktToken(accessToken: string) {
  if (env.traktUseMockData || !env.traktClientId || !env.traktClientSecret) {
    return;
  }

  await fetch(TRAKT_REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: accessToken,
      client_id: env.traktClientId,
      client_secret: env.traktClientSecret,
    }),
  }).catch(() => null);
}

async function getTraktProfile(args: {
  email: string;
  accessToken: string;
}) {
  if (env.traktUseMockData) {
    return getMockTraktProfile(args.email);
  }

  const profile = await traktFetchJson<TraktViewerProfile>("/users/me?extended=full", args.accessToken);

  return {
    userId: profile.ids?.slug ?? String(profile.ids?.trakt ?? ""),
    username: profile.username ?? profile.ids?.slug ?? "trakt-user",
  };
}

async function getTraktLastActivities(args: {
  email: string;
  accessToken: string;
}) {
  if (env.traktUseMockData) {
    return getMockTraktActivities(args.email);
  }

  return traktFetchJson<TraktLastActivities>("/sync/last_activities", args.accessToken);
}

function mapMovieEnvelopeToImportItem(item: TraktMovieEnvelope): MockTraktTitleItem | null {
  const tmdbId = item.movie?.ids?.tmdb;

  if (!tmdbId || !item.movie?.title) {
    return null;
  }

  return {
    mediaType: "movie",
    tmdbId,
    title: item.movie.title,
    year: item.movie.year ?? null,
    watchedAt: item.watched_at ?? null,
    watchlistedAt: item.listed_at ?? null,
    ratedAt: item.rated_at ?? null,
    rating: item.rating ?? null,
  };
}

function mapShowEnvelopeToImportItem(item: TraktShowEnvelope): MockTraktTitleItem | null {
  const tmdbId = item.show?.ids?.tmdb;

  if (!tmdbId || !item.show?.title) {
    return null;
  }

  return {
    mediaType: "tv",
    tmdbId,
    title: item.show.title,
    year: item.show.year ?? null,
    watchedAt: item.watched_at ?? null,
    watchlistedAt: item.listed_at ?? null,
    ratedAt: item.rated_at ?? null,
    rating: item.rating ?? null,
  };
}

async function fetchTraktWatched(args: {
  email: string;
  accessToken: string;
  mediaType: MediaTypeKey;
}) {
  if (env.traktUseMockData) {
    return getMockTraktWatchedItems(args.email, args.mediaType);
  }

  const path =
    args.mediaType === "movie" ? "/sync/watched/movies" : "/sync/watched/shows";
  const payload = await traktFetchJson<Array<TraktMovieEnvelope | TraktShowEnvelope>>(
    path,
    args.accessToken,
  );

  return payload
    .map((item) =>
      args.mediaType === "movie"
        ? mapMovieEnvelopeToImportItem(item as TraktMovieEnvelope)
        : mapShowEnvelopeToImportItem(item as TraktShowEnvelope),
    )
    .filter((item): item is MockTraktTitleItem => Boolean(item));
}

async function fetchTraktRatings(args: {
  email: string;
  accessToken: string;
  mediaType: MediaTypeKey;
}) {
  if (env.traktUseMockData) {
    return getMockTraktRatedItems(args.email, args.mediaType);
  }

  const path =
    args.mediaType === "movie" ? "/sync/ratings/movies" : "/sync/ratings/shows";
  const payload = await traktFetchJson<Array<TraktMovieEnvelope | TraktShowEnvelope>>(
    path,
    args.accessToken,
  );

  return payload
    .map((item) =>
      args.mediaType === "movie"
        ? mapMovieEnvelopeToImportItem(item as TraktMovieEnvelope)
        : mapShowEnvelopeToImportItem(item as TraktShowEnvelope),
    )
    .filter((item): item is MockTraktTitleItem => Boolean(item));
}

async function fetchTraktWatchlist(args: {
  email: string;
  accessToken: string;
  mediaType: MediaTypeKey;
}) {
  if (env.traktUseMockData) {
    return getMockTraktWatchlistItems(args.email, args.mediaType);
  }

  const path =
    args.mediaType === "movie" ? "/sync/watchlist/movies" : "/sync/watchlist/shows";
  const payload = await traktFetchJson<Array<TraktMovieEnvelope | TraktShowEnvelope>>(
    path,
    args.accessToken,
  );

  return payload
    .map((item) =>
      args.mediaType === "movie"
        ? mapMovieEnvelopeToImportItem(item as TraktMovieEnvelope)
        : mapShowEnvelopeToImportItem(item as TraktShowEnvelope),
    )
    .filter((item): item is MockTraktTitleItem => Boolean(item));
}

async function ensureTitleCacheForImport(item: MockTraktTitleItem) {
  const existing = await prisma.titleCache.findUnique({
    where: {
      tmdbId_mediaType: {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
  });

  if (existing) {
    return existing;
  }

  const detail = await getTitleDetails(item.tmdbId, item.mediaType);

  if (detail.data) {
    return upsertTitleCache(detail.data);
  }

  const fallbackTitle = {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    overview: "Imported from Trakt.",
    posterPath: null,
    backdropPath: null,
    releaseDate: item.year ? `${item.year}-01-01` : null,
    releaseYear: item.year ?? null,
    runtimeMinutes: null,
    genres: [],
    voteAverage: null,
    popularity: null,
    providers: [],
    providerStatus: "unknown" as const,
  };

  return upsertTitleCache(fallbackTitle);
}

async function getInteractionsForTitle(
  userId: string,
  titleCacheId: string,
  interactionTypes: InteractionType[],
) {
  return prisma.userTitleInteraction.findMany({
    where: {
      userId,
      titleCacheId,
      interactionType: { in: interactionTypes },
    },
  });
}

async function ensureImportedInteraction(args: {
  userId: string;
  titleCacheId: string;
  interactionType: InteractionType;
}) {
  const existing = await prisma.userTitleInteraction.findUnique({
    where: {
      userId_titleCacheId_interactionType: {
        userId: args.userId,
        titleCacheId: args.titleCacheId,
        interactionType: args.interactionType,
      },
    },
  });

  if (existing) {
    return {
      changed: false,
      sourceContext: existing.sourceContext,
    };
  }

  await prisma.userTitleInteraction.create({
    data: {
      userId: args.userId,
      titleCacheId: args.titleCacheId,
      interactionType: args.interactionType,
      sourceContext: SourceContext.IMPORTED,
    },
  });

  return {
    changed: true,
    sourceContext: SourceContext.IMPORTED,
  };
}

async function clearImportedInteraction(args: {
  userId: string;
  titleCacheId: string;
  interactionType: InteractionType;
}) {
  const removed = await prisma.userTitleInteraction.deleteMany({
    where: {
      userId: args.userId,
      titleCacheId: args.titleCacheId,
      interactionType: args.interactionType,
      sourceContext: SourceContext.IMPORTED,
    },
  });

  return removed.count;
}

async function syncImportedWatchedCategory(args: {
  userId: string;
  mediaType: MediaTypeKey;
  items: MockTraktTitleItem[];
}) {
  const currentImported = await prisma.userTitleInteraction.findMany({
    where: {
      userId: args.userId,
      interactionType: InteractionType.WATCHED,
      sourceContext: SourceContext.IMPORTED,
      title: {
        mediaType: args.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
    include: {
      title: {
        select: {
          id: true,
          tmdbId: true,
          mediaType: true,
        },
      },
    },
  });

  const incomingIds = new Set<string>();
  let imported = 0;
  let skippedWithoutTmdb = 0;

  for (const item of args.items) {
    if (!item.tmdbId) {
      skippedWithoutTmdb += 1;
      continue;
    }

    const cachedTitle = await ensureTitleCacheForImport(item);
    incomingIds.add(cachedTitle.id);
    const existing = await prisma.userTitleInteraction.findUnique({
      where: {
        userId_titleCacheId_interactionType: {
          userId: args.userId,
          titleCacheId: cachedTitle.id,
          interactionType: InteractionType.WATCHED,
        },
      },
    });

    if (existing?.sourceContext && existing.sourceContext !== SourceContext.IMPORTED) {
      continue;
    }

    const result = await ensureImportedInteraction({
      userId: args.userId,
      titleCacheId: cachedTitle.id,
      interactionType: InteractionType.WATCHED,
    });

    if (result.changed) {
      imported += 1;
    }
  }

  let cleared = 0;

  for (const interaction of currentImported) {
    if (!incomingIds.has(interaction.title.id)) {
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: interaction.title.id,
        interactionType: InteractionType.WATCHED,
      });
    }
  }

  return {
    imported,
    cleared,
    skippedWithoutTmdb,
  };
}

async function syncImportedWatchlistCategory(args: {
  userId: string;
  mediaType: MediaTypeKey;
  items: MockTraktTitleItem[];
}) {
  const currentImported = await prisma.userTitleInteraction.findMany({
    where: {
      userId: args.userId,
      interactionType: InteractionType.WATCHLIST,
      sourceContext: SourceContext.IMPORTED,
      title: {
        mediaType: args.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
    include: {
      title: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  const incomingIds = new Set<string>();
  let imported = 0;
  let skippedWithoutTmdb = 0;

  for (const item of args.items) {
    if (!item.tmdbId) {
      skippedWithoutTmdb += 1;
      continue;
    }

    const cachedTitle = await ensureTitleCacheForImport(item);
    incomingIds.add(cachedTitle.id);
    const existing = await getInteractionsForTitle(args.userId, cachedTitle.id, [
      InteractionType.WATCHLIST,
      InteractionType.WATCHED,
      InteractionType.HIDE,
    ]);
    const watchlistInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.WATCHLIST,
    );
    const watchedInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.WATCHED,
    );
    const hiddenInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.HIDE,
    );

    if (watchedInteraction || (hiddenInteraction && hiddenInteraction.sourceContext !== SourceContext.IMPORTED)) {
      continue;
    }

    if (watchlistInteraction?.sourceContext && watchlistInteraction.sourceContext !== SourceContext.IMPORTED) {
      continue;
    }

    const result = await ensureImportedInteraction({
      userId: args.userId,
      titleCacheId: cachedTitle.id,
      interactionType: InteractionType.WATCHLIST,
    });

    if (result.changed) {
      imported += 1;
    }
  }

  let cleared = 0;

  for (const interaction of currentImported) {
    if (!incomingIds.has(interaction.title.id)) {
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: interaction.title.id,
        interactionType: InteractionType.WATCHLIST,
      });
    }
  }

  return {
    imported,
    cleared,
    skippedWithoutTmdb,
  };
}

async function syncImportedRatingsCategory(args: {
  userId: string;
  mediaType: MediaTypeKey;
  items: MockTraktTitleItem[];
}) {
  const currentImported = await prisma.userTitleInteraction.findMany({
    where: {
      userId: args.userId,
      sourceContext: SourceContext.IMPORTED,
      interactionType: {
        in: [InteractionType.LIKE, InteractionType.DISLIKE],
      },
      title: {
        mediaType: args.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
    include: {
      title: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  const incomingIds = new Set<string>();
  let importedLikes = 0;
  let importedDislikes = 0;
  let cleared = 0;
  let skippedWithoutTmdb = 0;

  for (const item of args.items) {
    if (!item.tmdbId) {
      skippedWithoutTmdb += 1;
      continue;
    }

    const cachedTitle = await ensureTitleCacheForImport(item);
    incomingIds.add(cachedTitle.id);
    const desiredType = mapTraktRatingToInteraction(item.rating);
    const existing = await getInteractionsForTitle(args.userId, cachedTitle.id, [
      InteractionType.LIKE,
      InteractionType.DISLIKE,
      InteractionType.HIDE,
    ]);
    const likeInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.LIKE,
    );
    const dislikeInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.DISLIKE,
    );
    const hideInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.HIDE,
    );

    if (desiredType === null) {
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.LIKE,
      });
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.DISLIKE,
      });
      continue;
    }

    if (hideInteraction && hideInteraction.sourceContext !== SourceContext.IMPORTED) {
      continue;
    }

    if (desiredType === InteractionType.LIKE) {
      if (dislikeInteraction && dislikeInteraction.sourceContext !== SourceContext.IMPORTED) {
        continue;
      }

      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.DISLIKE,
      });

      if (!likeInteraction || likeInteraction.sourceContext === SourceContext.IMPORTED) {
        const result = await ensureImportedInteraction({
          userId: args.userId,
          titleCacheId: cachedTitle.id,
          interactionType: InteractionType.LIKE,
        });

        if (result.changed) {
          importedLikes += 1;
        }
      }
      continue;
    }

    if (likeInteraction && likeInteraction.sourceContext !== SourceContext.IMPORTED) {
      continue;
    }

    cleared += await clearImportedInteraction({
      userId: args.userId,
      titleCacheId: cachedTitle.id,
      interactionType: InteractionType.LIKE,
    });

    if (!dislikeInteraction || dislikeInteraction.sourceContext === SourceContext.IMPORTED) {
      const result = await ensureImportedInteraction({
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.DISLIKE,
      });

      if (result.changed) {
        importedDislikes += 1;
      }
    }
  }

  for (const interaction of currentImported) {
    if (!incomingIds.has(interaction.title.id)) {
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: interaction.title.id,
        interactionType: interaction.interactionType,
      });
    }
  }

  return {
    importedLikes,
    importedDislikes,
    cleared,
    skippedWithoutTmdb,
  };
}

async function updateConnectionAfterSuccessfulRefresh(args: {
  connectionId: string;
  token: TraktTokenResponse;
}) {
  await prisma.userTraktConnection.update({
    where: { id: args.connectionId },
    data: {
      accessTokenEncrypted: encryptSecret(args.token.access_token),
      refreshTokenEncrypted: encryptSecret(args.token.refresh_token),
      expiresAt: getTokenExpiresAt(args.token),
      scope: args.token.scope ?? null,
      lastSyncStatus: null,
      lastSyncError: null,
    },
  });
}

async function getAuthorizedTraktConnection(userId: string, householdId: string) {
  const connection = await prisma.userTraktConnection.findFirst({
    where: {
      userId,
      householdId,
    },
  });

  if (!connection) {
    throw new Error("Connect Trakt before running a sync.");
  }

  let accessToken = decryptSecret(connection.accessTokenEncrypted);
  const refreshToken = decryptSecret(connection.refreshTokenEncrypted);

  if (connection.expiresAt.getTime() <= Date.now() + 60_000) {
    try {
      const refreshedToken = await refreshTraktToken(refreshToken);
      await updateConnectionAfterSuccessfulRefresh({
        connectionId: connection.id,
        token: refreshedToken,
      });
      accessToken = refreshedToken.access_token;
    } catch (error) {
      await prisma.userTraktConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncStatus: TraktSyncStatus.NEEDS_REAUTH,
          lastSyncError:
            error instanceof Error
              ? error.message
              : "Trakt authorization expired. Please reconnect.",
        },
      });

      throw error;
    }
  }

  return {
    connection,
    accessToken,
  };
}

export async function getTraktConnectionSummary(args: {
  userId: string;
  householdId: string;
}): Promise<TraktConnectionSummary> {
  const connection = await prisma.userTraktConnection.findFirst({
    where: {
      userId: args.userId,
      householdId: args.householdId,
    },
  });

  return {
    isAvailable: traktConfigured(),
    isConnected: Boolean(connection),
    isMockMode: env.traktUseMockData,
    traktUsername: connection?.traktUsername ?? null,
    lastSyncedAt: safeIso(connection?.lastSyncedAt),
    lastSyncStatus: connection?.lastSyncStatus ?? null,
    lastSyncError: connection?.lastSyncError ?? null,
    importedScopes: ["watched history", "ratings", "watchlist"],
    disconnectKeepsImportedData: true,
  };
}

export async function linkTraktAccount(args: {
  userId: string;
  householdId: string;
  email: string;
  code: string;
}) {
  if (!traktConfigured()) {
    throw new Error("Trakt OAuth is not configured for this environment.");
  }

  const token = await exchangeTraktCode(args.code);
  const profile = await getTraktProfile({
    email: args.email,
    accessToken: token.access_token,
  });

  await prisma.userTraktConnection.upsert({
    where: {
      userId: args.userId,
    },
    update: {
      householdId: args.householdId,
      traktUserId: profile.userId || null,
      traktUsername: profile.username || null,
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      expiresAt: getTokenExpiresAt(token),
      scope: token.scope ?? null,
      lastSyncStatus: null,
      lastSyncError: null,
    },
    create: {
      userId: args.userId,
      householdId: args.householdId,
      traktUserId: profile.userId || null,
      traktUsername: profile.username || null,
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      expiresAt: getTokenExpiresAt(token),
      scope: token.scope ?? null,
    },
  });
}

export async function disconnectTraktAccount(args: {
  userId: string;
  householdId: string;
}) {
  const connection = await prisma.userTraktConnection.findFirst({
    where: {
      userId: args.userId,
      householdId: args.householdId,
    },
  });

  if (!connection) {
    return;
  }

  await revokeTraktToken(decryptSecret(connection.accessTokenEncrypted));

  await prisma.userTraktConnection.delete({
    where: {
      userId: args.userId,
    },
  });
}

export async function syncTraktAccount(args: {
  userId: string;
  householdId: string;
  email: string;
}) : Promise<TraktSyncResult> {
  const { connection, accessToken } = await getAuthorizedTraktConnection(
    args.userId,
    args.householdId,
  );

  try {
    const currentActivities = await getTraktLastActivities({
      email: args.email,
      accessToken,
    });
    const previousActivities = parseStoredActivities(connection.lastActivitiesJson);
    const syncPlan = determineTraktSyncPlan({
      currentActivities,
      previousActivities,
    });

    let watchedImported = 0;
    let watchlistImported = 0;
    let likesImported = 0;
    let dislikesImported = 0;
    let watchedCleared = 0;
    let watchlistCleared = 0;
    let ratingsCleared = 0;
    let skippedWithoutTmdb = 0;

    if (syncPlan.watchedMovies) {
      const result = await syncImportedWatchedCategory({
        userId: args.userId,
        mediaType: "movie",
        items: await fetchTraktWatched({
          email: args.email,
          accessToken,
          mediaType: "movie",
        }),
      });

      watchedImported += result.imported;
      watchedCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
    }

    if (syncPlan.watchedShows) {
      const result = await syncImportedWatchedCategory({
        userId: args.userId,
        mediaType: "tv",
        items: await fetchTraktWatched({
          email: args.email,
          accessToken,
          mediaType: "tv",
        }),
      });

      watchedImported += result.imported;
      watchedCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
    }

    if (syncPlan.watchlistMovies) {
      const result = await syncImportedWatchlistCategory({
        userId: args.userId,
        mediaType: "movie",
        items: await fetchTraktWatchlist({
          email: args.email,
          accessToken,
          mediaType: "movie",
        }),
      });

      watchlistImported += result.imported;
      watchlistCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
    }

    if (syncPlan.watchlistShows) {
      const result = await syncImportedWatchlistCategory({
        userId: args.userId,
        mediaType: "tv",
        items: await fetchTraktWatchlist({
          email: args.email,
          accessToken,
          mediaType: "tv",
        }),
      });

      watchlistImported += result.imported;
      watchlistCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
    }

    if (syncPlan.ratingsMovies) {
      const result = await syncImportedRatingsCategory({
        userId: args.userId,
        mediaType: "movie",
        items: await fetchTraktRatings({
          email: args.email,
          accessToken,
          mediaType: "movie",
        }),
      });

      likesImported += result.importedLikes;
      dislikesImported += result.importedDislikes;
      ratingsCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
    }

    if (syncPlan.ratingsShows) {
      const result = await syncImportedRatingsCategory({
        userId: args.userId,
        mediaType: "tv",
        items: await fetchTraktRatings({
          email: args.email,
          accessToken,
          mediaType: "tv",
        }),
      });

      likesImported += result.importedLikes;
      dislikesImported += result.importedDislikes;
      ratingsCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
    }

    const syncedAt = new Date();

    await prisma.userTraktConnection.update({
      where: {
        userId: args.userId,
      },
      data: {
        householdId: args.householdId,
        lastActivitiesJson: currentActivities as unknown as Prisma.InputJsonValue,
        lastSyncedAt: syncedAt,
        lastSyncStatus: TraktSyncStatus.SUCCESS,
        lastSyncError: null,
      },
    });

    return {
      syncedAt: syncedAt.toISOString(),
      imported: {
        watched: watchedImported,
        watchlist: watchlistImported,
        likes: likesImported,
        dislikes: dislikesImported,
      },
      cleared: {
        watched: watchedCleared,
        watchlist: watchlistCleared,
        ratings: ratingsCleared,
      },
      skippedWithoutTmdb,
    };
  } catch (error) {
    await prisma.userTraktConnection.update({
      where: {
        userId: args.userId,
      },
      data: {
        lastSyncStatus:
          error instanceof Error &&
          error.message.toLowerCase().includes("reconnect")
            ? TraktSyncStatus.NEEDS_REAUTH
            : TraktSyncStatus.ERROR,
        lastSyncError:
          error instanceof Error ? error.message : "Unable to sync Trakt right now.",
      },
    });

    throw error;
  }
}
