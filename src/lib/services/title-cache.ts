import { MediaType, type Prisma } from "@prisma/client";

import type {
  MediaTypeKey,
  ProviderAvailabilityStatus,
  TitleDetails,
  TitleSummary,
} from "@/lib/types";
import { prisma } from "@/lib/prisma";

function toMediaType(mediaType: MediaTypeKey) {
  return mediaType === "movie" ? MediaType.MOVIE : MediaType.TV;
}

export function toTmdbKey(tmdbId: number, mediaType: MediaTypeKey) {
  return `${mediaType}:${tmdbId}`;
}

function fromMediaType(mediaType: MediaType) {
  return mediaType === MediaType.MOVIE ? "movie" : "tv";
}

function getProviderStatusFromMetadata(
  metadataJson: Prisma.JsonValue | null,
  providers: TitleSummary["providers"],
): ProviderAvailabilityStatus {
  if (metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson)) {
    const status = (metadataJson as Record<string, unknown>).providerStatus;

    if (status === "available" || status === "unavailable" || status === "unknown") {
      return status;
    }
  }

  return providers.length > 0 ? "available" : "unknown";
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
  const providers = Array.isArray(cache.providerSnapshot)
    ? (cache.providerSnapshot as unknown as TitleSummary["providers"])
    : [];

  return {
    tmdbId: cache.tmdbId,
    mediaType: fromMediaType(cache.mediaType),
    title: cache.title,
    overview: cache.overview,
    posterPath: cache.posterPath,
    backdropPath: cache.backdropPath,
    releaseDate: cache.releaseDate?.toISOString().slice(0, 10) ?? null,
    releaseYear: cache.releaseDate?.getUTCFullYear() ?? null,
    runtimeMinutes: cache.runtimeMinutes,
    genres: cache.genres,
    voteAverage: cache.voteAverage,
    popularity: cache.popularity,
    providers,
    providerStatus: getProviderStatusFromMetadata(cache.metadataJson, providers),
  };
}

export async function getFreshTitleProviderSnapshots(
  titles: Array<{ tmdbId: number; mediaType: MediaTypeKey }>,
  maxAgeMs: number,
) {
  if (titles.length === 0) {
    return new Map<
      string,
      {
        providers: TitleSummary["providers"];
        providerStatus: ProviderAvailabilityStatus;
      }
    >();
  }

  const cutoff = new Date(Date.now() - maxAgeMs);
  const matches = await prisma.titleCache.findMany({
    where: {
      lastSyncedAt: { gte: cutoff },
      OR: titles.map((title) => ({
        tmdbId: title.tmdbId,
        mediaType: toMediaType(title.mediaType),
      })),
    },
    select: {
      tmdbId: true,
      mediaType: true,
      providerSnapshot: true,
      metadataJson: true,
    },
  });

  return new Map(
    matches.map((match) => {
      const providers = Array.isArray(match.providerSnapshot)
        ? (match.providerSnapshot as unknown as TitleSummary["providers"])
        : [];

      return [
        toTmdbKey(match.tmdbId, fromMediaType(match.mediaType)),
        {
          providers,
          providerStatus: getProviderStatusFromMetadata(match.metadataJson, providers),
        },
      ] as const;
    }),
  );
}

export async function getFreshTitleDetailsFromCache(
  tmdbId: number,
  mediaType: MediaTypeKey,
  maxAgeMs: number,
): Promise<TitleDetails | null> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const cached = await prisma.titleCache.findUnique({
    where: {
      tmdbId_mediaType: {
        tmdbId,
        mediaType: toMediaType(mediaType),
      },
    },
    select: {
      metadataJson: true,
      lastSyncedAt: true,
    },
  });

  if (!cached || cached.lastSyncedAt < cutoff) {
    return null;
  }

  if (!cached.metadataJson || typeof cached.metadataJson !== "object" || Array.isArray(cached.metadataJson)) {
    return null;
  }

  const json = cached.metadataJson as Record<string, unknown>;
  if (
    typeof json.tmdbId !== "number" ||
    typeof json.title !== "string" ||
    (json.mediaType !== "movie" && json.mediaType !== "tv")
  ) {
    return null;
  }

  return json as unknown as TitleDetails;
}
