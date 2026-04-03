import { MediaType, type Prisma } from "@prisma/client";

import type { MediaTypeKey, TitleDetails, TitleSummary } from "@/lib/types";
import { prisma } from "@/lib/prisma";

function toMediaType(mediaType: MediaTypeKey) {
  return mediaType === "movie" ? MediaType.MOVIE : MediaType.TV;
}

export function toTmdbKey(tmdbId: number, mediaType: MediaTypeKey) {
  return `${mediaType}:${tmdbId}`;
}

export async function upsertTitleCache(title: TitleSummary | TitleDetails) {
  const providerSnapshot = title.providers as unknown as Prisma.InputJsonValue;
  const metadataJson = title as unknown as Prisma.InputJsonValue;

  return prisma.titleCache.upsert({
    where: {
      tmdbId_mediaType: {
        tmdbId: title.tmdbId,
        mediaType: toMediaType(title.mediaType),
      },
    },
    update: {
      title: title.title,
      overview: title.overview,
      posterPath: title.posterPath,
      backdropPath: title.backdropPath,
      releaseDate: title.releaseDate ? new Date(title.releaseDate) : null,
      runtimeMinutes: title.runtimeMinutes ?? null,
      genres: title.genres,
      voteAverage: title.voteAverage ?? null,
      popularity: title.popularity ?? null,
      providerSnapshot,
      metadataJson,
      lastSyncedAt: new Date(),
    },
    create: {
      tmdbId: title.tmdbId,
      mediaType: toMediaType(title.mediaType),
      title: title.title,
      overview: title.overview,
      posterPath: title.posterPath,
      backdropPath: title.backdropPath,
      releaseDate: title.releaseDate ? new Date(title.releaseDate) : null,
      runtimeMinutes: title.runtimeMinutes ?? null,
      genres: title.genres,
      voteAverage: title.voteAverage ?? null,
      popularity: title.popularity ?? null,
      providerSnapshot,
      metadataJson,
    },
  });
}

export function mapTitleCacheToSummary(
  cache: Awaited<ReturnType<typeof upsertTitleCache>>,
): TitleSummary {
  return {
    tmdbId: cache.tmdbId,
    mediaType: cache.mediaType === MediaType.MOVIE ? "movie" : "tv",
    title: cache.title,
    overview: cache.overview,
    posterPath: cache.posterPath,
    backdropPath: cache.backdropPath,
    releaseDate: cache.releaseDate?.toISOString().slice(0, 10) ?? null,
    runtimeMinutes: cache.runtimeMinutes,
    genres: cache.genres,
    voteAverage: cache.voteAverage,
    popularity: cache.popularity,
    providers: Array.isArray(cache.providerSnapshot)
      ? (cache.providerSnapshot as unknown as TitleSummary["providers"])
      : [],
  };
}
