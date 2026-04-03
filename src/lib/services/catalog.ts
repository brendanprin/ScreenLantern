import { env } from "@/lib/env";
import {
  discoverMockTitles,
  getMockRecommendationCandidates,
  getMockTitleDetails,
  MOCK_GENRES,
  searchMockTitles,
} from "@/lib/mock-tmdb";
import type {
  DiscoverTitlesInput,
  MediaTypeKey,
  PagedResult,
  ProviderInfo,
  SearchTitlesInput,
  TitleDetails,
  TitleSummary,
} from "@/lib/types";

const GENRE_NAME_TO_ID: Record<string, number> = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Mystery: 9648,
  Romance: 10749,
  "Science Fiction": 878,
  Thriller: 53,
  War: 10752,
};

interface TMDbBaseResult {
  id: number;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  title?: string;
  name?: string;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  media_type?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  origin_country?: string[];
}

interface TMDbCreditsResult {
  cast?: Array<{ name: string; character?: string | null }>;
}

interface TMDbProviderResult {
  results?: Record<
    string,
    {
      flatrate?: Array<{ provider_id: number; provider_name: string; logo_path?: string | null }>;
      ads?: Array<{ provider_id: number; provider_name: string; logo_path?: string | null }>;
      free?: Array<{ provider_id: number; provider_name: string; logo_path?: string | null }>;
      rent?: Array<{ provider_id: number; provider_name: string; logo_path?: string | null }>;
      buy?: Array<{ provider_id: number; provider_name: string; logo_path?: string | null }>;
    }
  >;
}

interface TMDbDetailResult extends TMDbBaseResult {
  credits?: TMDbCreditsResult;
  seasons?: Array<{
    season_number: number;
    name: string;
    episode_count: number;
  }>;
  status?: string;
}

async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  if (!env.tmdbApiKey) {
    throw new Error("TMDB_API_KEY is missing.");
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", env.tmdbApiKey);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value.toString());
    }
  });

  const response = await fetch(url.toString(), {
    next: { revalidate: 60 * 60 * 6 },
  });

  if (!response.ok) {
    throw new Error(`TMDb request failed for ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

function mapGenreIdsToNames(genreIds: number[] = []) {
  return genreIds
    .map((genreId) =>
      Object.entries(GENRE_NAME_TO_ID).find(([, id]) => id === genreId)?.[0],
    )
    .filter((genre): genre is string => Boolean(genre));
}

function normalizeProviders(
  providerPayload: TMDbProviderResult,
  mediaType: MediaTypeKey,
): ProviderInfo[] {
  const regionData = providerPayload.results?.[env.tmdbWatchRegion];

  if (!regionData) {
    return [];
  }

  const buckets: Array<[string, ProviderInfo[] | undefined]> = [
    [
      "flatrate",
      regionData.flatrate?.map((provider) => ({
        id: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path ?? null,
        type: "flatrate",
      })),
    ],
    [
      "free",
      regionData.free?.map((provider) => ({
        id: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path ?? null,
        type: "free",
      })),
    ],
    [
      "ads",
      regionData.ads?.map((provider) => ({
        id: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path ?? null,
        type: "ads",
      })),
    ],
  ];

  return buckets
    .flatMap(([, items]) => items ?? [])
    .filter(
      (provider, index, all) =>
        index ===
        all.findIndex((candidate) => candidate.name === provider.name),
    );
}

function normalizeSummary(
  result: TMDbBaseResult,
  mediaTypeOverride?: MediaTypeKey,
  providers: ProviderInfo[] = [],
): TitleSummary {
  const mediaType =
    mediaTypeOverride ??
    (result.media_type === "tv" ? "tv" : "movie");

  return {
    tmdbId: result.id,
    mediaType,
    title: result.title ?? result.name ?? "Untitled",
    overview: result.overview ?? "",
    posterPath: result.poster_path ?? null,
    backdropPath: result.backdrop_path ?? null,
    releaseDate: result.release_date ?? result.first_air_date ?? null,
    runtimeMinutes:
      mediaType === "movie"
        ? result.runtime ?? null
        : result.episode_run_time?.[0] ?? null,
    genres: result.genres?.map((genre) => genre.name) ?? mapGenreIdsToNames(result.genre_ids),
    voteAverage: result.vote_average ?? null,
    popularity: result.popularity ?? null,
    providers,
  };
}

export async function searchTitles(
  input: SearchTitlesInput,
): Promise<PagedResult<TitleSummary>> {
  if (env.tmdbUseMockData) {
    return searchMockTitles(
      input.query,
      input.page,
      input.mediaType === "all" ? "all" : input.mediaType,
    );
  }

  if (!input.query.trim()) {
    return { page: 1, totalPages: 1, totalResults: 0, results: [] };
  }

  if (input.mediaType === "all") {
    const response = await tmdbFetch<{
      page: number;
      total_pages: number;
      total_results: number;
      results: TMDbBaseResult[];
    }>("/search/multi", {
      query: input.query,
      page: input.page ?? 1,
      include_adult: "false",
    });

    const results = response.results
      .filter((result) => result.media_type === "movie" || result.media_type === "tv")
      .map((result) => normalizeSummary(result));

    return {
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      results,
    };
  }

  const response = await tmdbFetch<{
    page: number;
    total_pages: number;
    total_results: number;
    results: TMDbBaseResult[];
  }>(`/search/${input.mediaType}`, {
    query: input.query,
    page: input.page ?? 1,
    include_adult: "false",
  });

  return {
    page: response.page,
    totalPages: response.total_pages,
    totalResults: response.total_results,
    results: response.results.map((result) =>
      normalizeSummary(result, input.mediaType as MediaTypeKey),
    ),
  };
}

async function getProviderIdByName(name: string, mediaType: MediaTypeKey) {
  const response = await tmdbFetch<{
    results: Array<{ provider_id: number; provider_name: string }>;
  }>(`/watch/providers/${mediaType}`, {
    watch_region: env.tmdbWatchRegion,
  });

  return (
    response.results.find((provider) => provider.provider_name === name)
      ?.provider_id ?? null
  );
}

export async function discoverTitles(
  input: DiscoverTitlesInput,
): Promise<PagedResult<TitleSummary>> {
  if (env.tmdbUseMockData) {
    return discoverMockTitles(input);
  }

  const genreId = input.genre ? GENRE_NAME_TO_ID[input.genre] : undefined;
  const providerId =
    input.provider && input.mediaType
      ? await getProviderIdByName(input.provider, input.mediaType)
      : null;

  const response = await tmdbFetch<{
    page: number;
    total_pages: number;
    total_results: number;
    results: TMDbBaseResult[];
  }>(`/discover/${input.mediaType ?? "movie"}`, {
    page: input.page ?? 1,
    sort_by: input.sortBy ?? "popularity.desc",
    with_genres: genreId,
    with_watch_providers: providerId ?? undefined,
    watch_region: providerId ? env.tmdbWatchRegion : undefined,
    primary_release_year: input.year,
    "with_runtime.lte": input.runtimeMax,
    include_adult: "false",
    vote_count_gte: 50,
  });

  return {
    page: response.page,
    totalPages: response.total_pages,
    totalResults: response.total_results,
    results: response.results.map((result) =>
      normalizeSummary(result, input.mediaType ?? "movie"),
    ),
  };
}

export async function getTitleDetails(
  tmdbId: number,
  mediaType: MediaTypeKey,
): Promise<TitleDetails | null> {
  if (env.tmdbUseMockData) {
    return getMockTitleDetails(tmdbId, mediaType);
  }

  const detail = await tmdbFetch<TMDbDetailResult>(`/${mediaType}/${tmdbId}`, {
    append_to_response: "credits",
  });
  const providers = await tmdbFetch<TMDbProviderResult>(
    `/${mediaType}/${tmdbId}/watch/providers`,
  );

  return {
    ...normalizeSummary(detail, mediaType, normalizeProviders(providers, mediaType)),
    cast:
      detail.credits?.cast?.slice(0, 8).map((member) => ({
        name: member.name,
        character: member.character,
      })) ?? [],
    seasons:
      detail.seasons?.map((season) => ({
        seasonNumber: season.season_number,
        name: season.name,
        episodeCount: season.episode_count,
      })) ?? [],
    status: detail.status ?? null,
    originCountries: detail.origin_country ?? [],
  };
}

export async function hydrateProvidersForTitles(
  titles: TitleSummary[],
): Promise<TitleSummary[]> {
  if (env.tmdbUseMockData) {
    return titles;
  }

  return Promise.all(
    titles.map(async (title) => {
      if (title.providers.length > 0) {
        return title;
      }

      const providerPayload = await tmdbFetch<TMDbProviderResult>(
        `/${title.mediaType}/${title.tmdbId}/watch/providers`,
      );

      return {
        ...title,
        providers: normalizeProviders(providerPayload, title.mediaType),
      };
    }),
  );
}

export async function getRecommendationCandidatePool(args: {
  mediaTypes: MediaTypeKey[];
  genres: string[];
  providers: string[];
}): Promise<TitleSummary[]> {
  if (env.tmdbUseMockData) {
    return getMockRecommendationCandidates(
      args.mediaTypes,
      args.genres,
      args.providers,
    );
  }

  const batches = await Promise.all(
    args.mediaTypes.flatMap((mediaType) => {
      const primaryGenre = args.genres[0];
      const secondaryGenre = args.genres[1];

      return [
        discoverTitles({ mediaType, genre: primaryGenre, page: 1 }),
        discoverTitles({ mediaType, genre: secondaryGenre, page: 1 }),
        discoverTitles({
          mediaType,
          provider: args.providers[0],
          page: 1,
          sortBy: "popularity.desc",
        }),
      ];
    }),
  );

  const combined = batches.flatMap((batch) => batch.results).slice(0, 36);
  return hydrateProvidersForTitles(
    combined.filter(
      (title, index, all) =>
        index ===
        all.findIndex(
          (candidate) =>
            candidate.tmdbId === title.tmdbId &&
            candidate.mediaType === title.mediaType,
        ),
    ),
  );
}

export function getGenreOptions() {
  return env.tmdbUseMockData
    ? MOCK_GENRES
    : Object.keys(GENRE_NAME_TO_ID).sort((left, right) => left.localeCompare(right));
}
