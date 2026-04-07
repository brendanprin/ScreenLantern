import { env } from "@/lib/env";
import { PROVIDER_OPTIONS } from "@/lib/constants";
import {
  discoverMockTitles,
  getMockRecommendationCandidates,
  getMockTitleDetails,
  MOCK_GENRES,
  searchMockTitles,
} from "@/lib/mock-tmdb";
import {
  getFreshTitleDetailsFromCache,
  getFreshTitleProviderSnapshots,
  toTmdbKey,
} from "@/lib/services/title-cache";
import { dedupeByKey } from "@/lib/utils";
import type {
  DiscoverTitlesInput,
  MediaTypeKey,
  PagedResult,
  ProviderAvailabilityStatus,
  ProviderInfo,
  SearchTitlesInput,
  TitleDetails,
  TitleDetailsResult,
  TitleSummary,
} from "@/lib/types";

const TMDB_FETCH_TIMEOUT_MS = 8_000;
const TMDB_FETCH_REVALIDATE_SECONDS = 60 * 60 * 6;
const GENRE_CATALOG_TTL_MS = 1000 * 60 * 60 * 24;
const PROVIDER_CATALOG_TTL_MS = 1000 * 60 * 60 * 24;
const TITLE_PROVIDER_TTL_MS = 1000 * 60 * 60 * 12;
const TITLE_DETAIL_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const TMDB_PROVIDER_CONCURRENCY = 5;

const FALLBACK_GENRE_CATALOGS: Record<
  MediaTypeKey,
  Array<{ id: number; name: string }>
> = {
  movie: [
    { id: 28, name: "Action" },
    { id: 12, name: "Adventure" },
    { id: 16, name: "Animation" },
    { id: 35, name: "Comedy" },
    { id: 80, name: "Crime" },
    { id: 99, name: "Documentary" },
    { id: 18, name: "Drama" },
    { id: 10751, name: "Family" },
    { id: 14, name: "Fantasy" },
    { id: 36, name: "History" },
    { id: 27, name: "Horror" },
    { id: 9648, name: "Mystery" },
    { id: 10749, name: "Romance" },
    { id: 878, name: "Science Fiction" },
    { id: 10770, name: "TV Movie" },
    { id: 53, name: "Thriller" },
    { id: 10752, name: "War" },
    { id: 37, name: "Western" },
  ],
  tv: [
    { id: 10759, name: "Action & Adventure" },
    { id: 16, name: "Animation" },
    { id: 35, name: "Comedy" },
    { id: 80, name: "Crime" },
    { id: 99, name: "Documentary" },
    { id: 18, name: "Drama" },
    { id: 10751, name: "Family" },
    { id: 10762, name: "Kids" },
    { id: 9648, name: "Mystery" },
    { id: 10763, name: "News" },
    { id: 10764, name: "Reality" },
    { id: 10765, name: "Sci-Fi & Fantasy" },
    { id: 10766, name: "Soap" },
    { id: 10767, name: "Talk" },
    { id: 10768, name: "War & Politics" },
    { id: 37, name: "Western" },
  ],
};

interface TMDbBaseResult {
  id: number;
  poster_path: string | null;
  backdrop_path: string | null;
  overview?: string | null;
  vote_average?: number | null;
  popularity?: number | null;
  release_date?: string | null;
  first_air_date?: string | null;
  title?: string | null;
  name?: string | null;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  media_type?: string | null;
  runtime?: number | null;
  episode_run_time?: number[];
  origin_country?: string[];
}

interface TMDbCreditsResult {
  cast?: Array<{ name: string; character?: string | null }>;
}

interface TMDbProviderBucketEntry {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
}

interface TMDbProviderRegionResult {
  flatrate?: TMDbProviderBucketEntry[];
  ads?: TMDbProviderBucketEntry[];
  free?: TMDbProviderBucketEntry[];
  rent?: TMDbProviderBucketEntry[];
  buy?: TMDbProviderBucketEntry[];
}

interface TMDbProviderResult {
  results?: Record<string, TMDbProviderRegionResult>;
}

interface TMDbProviderCatalogResult {
  results?: Array<{
    provider_id: number;
    provider_name: string;
    logo_path?: string | null;
    display_priority?: number | null;
  }>;
}

interface TMDbGenreListResult {
  genres?: Array<{ id: number; name: string }>;
}

interface TMDbDetailResult extends TMDbBaseResult {
  credits?: TMDbCreditsResult;
  seasons?: Array<{
    season_number: number;
    name: string;
    episode_count: number;
  }>;
  status?: string | null;
}

interface TMDbPagedResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TMDbBaseResult[];
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

interface NormalizedProviderAvailability {
  providers: ProviderInfo[];
  providerStatus: ProviderAvailabilityStatus;
}

type ProviderCatalogEntry = {
  id?: number;
  name: string;
  logoPath?: string | null;
  displayPriority?: number | null;
};

const genreCatalogCache = new Map<MediaTypeKey, CacheEntry<Array<{ id: number; name: string }>>>();
const providerCatalogCache = new Map<string, CacheEntry<ProviderCatalogEntry[]>>();
const titleProviderCache = new Map<string, CacheEntry<NormalizedProviderAvailability>>();

class TMDbRequestError extends Error {
  kind: "not_found" | "rate_limited" | "network" | "invalid_response" | "http_error";
  status?: number;

  constructor(
    kind: TMDbRequestError["kind"],
    message: string,
    options?: { status?: number },
  ) {
    super(message);
    this.name = "TMDbRequestError";
    this.kind = kind;
    this.status = options?.status;
  }
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  return value;
}

function getGenreCatalogCacheKey(mediaType: MediaTypeKey) {
  return mediaType;
}

function getProviderCatalogCacheKey(mediaType: MediaTypeKey) {
  return `${mediaType}:${env.tmdbWatchRegion}`;
}

function getTitleProviderCacheKey(tmdbId: number, mediaType: MediaTypeKey) {
  return `${toTmdbKey(tmdbId, mediaType)}:${env.tmdbWatchRegion}`;
}

function normalizeReleaseYear(releaseDate: string | null) {
  if (!releaseDate) {
    return null;
  }

  const match = /^(\d{4})/.exec(releaseDate);
  return match ? Number(match[1]) : null;
}

function normalizeRuntime(
  mediaType: MediaTypeKey,
  result: Pick<TMDbBaseResult, "runtime" | "episode_run_time">,
) {
  if (mediaType === "movie") {
    return typeof result.runtime === "number" ? result.runtime : null;
  }

  const episodeRuntime = result.episode_run_time?.find(
    (value) => typeof value === "number" && value > 0,
  );

  return episodeRuntime ?? null;
}

function normalizeMediaType(
  input: Pick<TMDbBaseResult, "media_type">,
  override?: MediaTypeKey,
): MediaTypeKey {
  if (override) {
    return override;
  }

  return input.media_type === "tv" ? "tv" : "movie";
}

function buildGenreNameMap(catalog: Array<{ id: number; name: string }>) {
  return new Map(catalog.map((genre) => [genre.id, genre.name]));
}

function buildFallbackGenreNameMap(mediaType: MediaTypeKey) {
  return buildGenreNameMap(FALLBACK_GENRE_CATALOGS[mediaType]);
}

function normalizeGenres(
  result: Pick<TMDbBaseResult, "genres" | "genre_ids">,
  mediaType: MediaTypeKey,
  genreNameMap?: Map<number, string>,
) {
  if (Array.isArray(result.genres) && result.genres.length > 0) {
    return result.genres
      .map((genre) => genre.name)
      .filter((genre): genre is string => Boolean(genre))
      .slice(0, 8);
  }

  const sourceMap = genreNameMap ?? buildFallbackGenreNameMap(mediaType);
  return (result.genre_ids ?? [])
    .map((genreId) => sourceMap.get(genreId))
    .filter((genre): genre is string => Boolean(genre))
    .slice(0, 8);
}

export function normalizeProviderAvailability(
  providerPayload: TMDbProviderResult | null | undefined,
  region = env.tmdbWatchRegion,
): NormalizedProviderAvailability {
  if (!providerPayload?.results || typeof providerPayload.results !== "object") {
    return {
      providers: [],
      providerStatus: "unknown",
    };
  }

  const regionData = providerPayload.results[region];

  if (!regionData) {
    return {
      providers: [],
      providerStatus: "unknown",
    };
  }

  const buckets: Array<[NonNullable<ProviderInfo["type"]>, TMDbProviderBucketEntry[] | undefined]> =
    [
      ["flatrate", regionData.flatrate],
      ["free", regionData.free],
      ["ads", regionData.ads],
      ["rent", regionData.rent],
      ["buy", regionData.buy],
    ];

  const providers = dedupeByKey(
    buckets.flatMap(([type, items]) =>
      (items ?? []).map((provider) => ({
        id: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path ?? null,
        type,
      })),
    ),
    (provider) => `${provider.id ?? provider.name}:${provider.type ?? ""}`,
  );

  return {
    providers,
    providerStatus: providers.length > 0 ? "available" : "unavailable",
  };
}

export function mapDiscoverSort(
  mediaType: MediaTypeKey,
  sortBy: DiscoverTitlesInput["sortBy"] = "popularity.desc",
) {
  if (sortBy === "newest.desc") {
    return mediaType === "movie"
      ? "primary_release_date.desc"
      : "first_air_date.desc";
  }

  return sortBy ?? "popularity.desc";
}

export function buildDiscoverRequest(
  input: DiscoverTitlesInput,
  resolved: {
    genreId?: number;
    providerId?: number | null;
  } = {},
) {
  const mediaType = input.mediaType ?? "movie";
  const params: Record<string, string | number | undefined> = {
    page: input.page ?? 1,
    sort_by: mapDiscoverSort(mediaType, input.sortBy),
    with_genres: resolved.genreId,
    with_watch_providers: resolved.providerId ?? undefined,
    watch_region: resolved.providerId ? env.tmdbWatchRegion : undefined,
    "with_runtime.lte": input.runtimeMax,
    include_adult: "false",
    vote_count_gte: 50,
  };

  if (typeof input.year === "number") {
    params[mediaType === "movie" ? "primary_release_year" : "first_air_date_year"] =
      input.year;
  }

  return {
    path: `/discover/${mediaType}`,
    params,
  };
}

export function normalizeTitleSummary(
  result: TMDbBaseResult,
  options?: {
    mediaTypeOverride?: MediaTypeKey;
    providers?: ProviderInfo[];
    providerStatus?: ProviderAvailabilityStatus;
    genreNameMap?: Map<number, string>;
  },
): TitleSummary {
  const mediaType = normalizeMediaType(result, options?.mediaTypeOverride);
  const releaseDate =
    mediaType === "movie"
      ? result.release_date ?? null
      : result.first_air_date ?? null;

  return {
    tmdbId: result.id,
    mediaType,
    title:
      mediaType === "movie"
        ? result.title ?? result.name ?? "Untitled"
        : result.name ?? result.title ?? "Untitled",
    overview: result.overview ?? "",
    posterPath: result.poster_path ?? null,
    backdropPath: result.backdrop_path ?? null,
    releaseDate,
    releaseYear: normalizeReleaseYear(releaseDate),
    runtimeMinutes: normalizeRuntime(mediaType, result),
    genres: normalizeGenres(result, mediaType, options?.genreNameMap),
    voteAverage: result.vote_average ?? null,
    popularity: result.popularity ?? null,
    providers: options?.providers ?? [],
    providerStatus: options?.providerStatus ?? "unknown",
  };
}

async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options?: { revalidateSeconds?: number },
): Promise<T> {
  if (!env.tmdbApiKey) {
    throw new TMDbRequestError(
      "http_error",
      "TMDb is not configured because TMDB_API_KEY is missing.",
    );
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", env.tmdbApiKey);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TMDB_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      next: {
        revalidate: options?.revalidateSeconds ?? TMDB_FETCH_REVALIDATE_SECONDS,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new TMDbRequestError("not_found", `TMDb resource not found: ${path}`, {
          status: response.status,
        });
      }

      if (response.status === 429) {
        throw new TMDbRequestError("rate_limited", `TMDb rate limit hit for ${path}`, {
          status: response.status,
        });
      }

      throw new TMDbRequestError("http_error", `TMDb request failed for ${path}`, {
        status: response.status,
      });
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new TMDbRequestError(
        "invalid_response",
        `TMDb returned malformed JSON for ${path}`,
      );
    }
  } catch (error) {
    if (error instanceof TMDbRequestError) {
      throw error;
    }

    throw new TMDbRequestError(
      "network",
      error instanceof Error ? error.message : `TMDb network failure for ${path}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function sortCatalogEntriesByName(entries: string[]) {
  return [...entries].sort((left, right) => left.localeCompare(right));
}

function basePagedResult<T>(source: "live" | "mock"): PagedResult<T> {
  return {
    page: 1,
    totalPages: 1,
    totalResults: 0,
    results: [],
    notice: null,
    source,
  };
}

function getListFailureNotice(error: unknown) {
  if (error instanceof TMDbRequestError) {
    if (error.kind === "rate_limited") {
      return "ScreenLantern hit a temporary TMDb rate limit. Try again in a moment.";
    }

    return "ScreenLantern could not refresh live TMDb results right now. Try again shortly.";
  }

  return "ScreenLantern could not refresh live TMDb results right now. Try again shortly.";
}

function getDetailFailureNotice(error: unknown, usingCache: boolean) {
  if (usingCache) {
    return "Live TMDb details are temporarily unavailable. Showing the most recently cached title data.";
  }

  if (error instanceof TMDbRequestError && error.kind === "rate_limited") {
    return "TMDb is rate-limiting ScreenLantern right now, so live title details could not be loaded.";
  }

  return "ScreenLantern could not load live title details right now.";
}

async function getGenreCatalog(mediaType: MediaTypeKey) {
  const cacheKey = getGenreCatalogCacheKey(mediaType);
  const cached = readCache(genreCatalogCache, cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const response = await tmdbFetch<TMDbGenreListResult>(`/genre/${mediaType}/list`, undefined, {
      revalidateSeconds: 60 * 60 * 24,
    });
    const genres = (response.genres ?? [])
      .filter((genre) => typeof genre.id === "number" && Boolean(genre.name))
      .sort((left, right) => left.name.localeCompare(right.name));

    return writeCache(genreCatalogCache, cacheKey, genres, GENRE_CATALOG_TTL_MS);
  } catch {
    return FALLBACK_GENRE_CATALOGS[mediaType];
  }
}

async function getProviderCatalog(mediaType: MediaTypeKey) {
  const cacheKey = getProviderCatalogCacheKey(mediaType);
  const cached = readCache(providerCatalogCache, cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const response = await tmdbFetch<TMDbProviderCatalogResult>(
      `/watch/providers/${mediaType}`,
      {
        watch_region: env.tmdbWatchRegion,
      },
      {
        revalidateSeconds: 60 * 60 * 24,
      },
    );

    const providers = (response.results ?? [])
      .filter((provider) => Boolean(provider.provider_name))
      .map((provider) => ({
        id: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path ?? null,
        displayPriority: provider.display_priority ?? null,
      }))
      .sort((left, right) => {
        const leftPriority = left.displayPriority ?? Number.MAX_SAFE_INTEGER;
        const rightPriority = right.displayPriority ?? Number.MAX_SAFE_INTEGER;

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return left.name.localeCompare(right.name);
      });

    return writeCache(
      providerCatalogCache,
      cacheKey,
      providers,
      PROVIDER_CATALOG_TTL_MS,
    );
  } catch {
    return PROVIDER_OPTIONS.map((name, index) => ({
      id: undefined,
      name,
      logoPath: null,
      displayPriority: index,
    }));
  }
}

async function getProviderIdByName(name: string, mediaType: MediaTypeKey) {
  const providers = await getProviderCatalog(mediaType);
  const provider = providers.find((item) => item.name === name);
  return typeof provider?.id === "number" ? provider.id : null;
}

async function getTitleProviderAvailability(
  tmdbId: number,
  mediaType: MediaTypeKey,
): Promise<NormalizedProviderAvailability> {
  const memoryCacheKey = getTitleProviderCacheKey(tmdbId, mediaType);
  const cached = readCache(titleProviderCache, memoryCacheKey);

  if (cached) {
    return cached;
  }

  const persisted = await getFreshTitleProviderSnapshots(
    [{ tmdbId, mediaType }],
    TITLE_PROVIDER_TTL_MS,
  );
  const persistedMatch = persisted.get(toTmdbKey(tmdbId, mediaType));

  if (persistedMatch) {
    return writeCache(
      titleProviderCache,
      memoryCacheKey,
      persistedMatch,
      TITLE_PROVIDER_TTL_MS,
    );
  }

  const payload = await tmdbFetch<TMDbProviderResult>(
    `/${mediaType}/${tmdbId}/watch/providers`,
  );
  const normalized = normalizeProviderAvailability(payload);

  return writeCache(
    titleProviderCache,
    memoryCacheKey,
    normalized,
    TITLE_PROVIDER_TTL_MS,
  );
}

export async function searchTitles(
  input: SearchTitlesInput,
): Promise<PagedResult<TitleSummary>> {
  if (env.tmdbUseMockData) {
    return {
      ...searchMockTitles(
        input.query,
        input.page,
        input.mediaType === "all" ? "all" : input.mediaType,
      ),
      source: "mock",
      notice: null,
    };
  }

  if (!input.query.trim()) {
    return basePagedResult("live");
  }

  try {
    if (input.mediaType === "all") {
      const response = await tmdbFetch<TMDbPagedResponse>("/search/multi", {
        query: input.query,
        page: input.page ?? 1,
        include_adult: "false",
      });

      const [movieGenres, tvGenres] = await Promise.all([
        getGenreCatalog("movie"),
        getGenreCatalog("tv"),
      ]);
      const movieGenreMap = buildGenreNameMap(movieGenres);
      const tvGenreMap = buildGenreNameMap(tvGenres);

      return {
        page: response.page,
        totalPages: response.total_pages,
        totalResults: response.total_results,
        results: response.results
          .filter((result) => result.media_type === "movie" || result.media_type === "tv")
          .map((result) =>
            normalizeTitleSummary(result, {
              genreNameMap:
                result.media_type === "tv" ? tvGenreMap : movieGenreMap,
            }),
          ),
        source: "live",
        notice: null,
      };
    }

    const mediaType = input.mediaType ?? "movie";
    const [response, genreCatalog] = await Promise.all([
      tmdbFetch<TMDbPagedResponse>(`/search/${mediaType}`, {
        query: input.query,
        page: input.page ?? 1,
        include_adult: "false",
      }),
      getGenreCatalog(mediaType),
    ]);
    const genreNameMap = buildGenreNameMap(genreCatalog);

    return {
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      results: response.results.map((result) =>
        normalizeTitleSummary(result, {
          mediaTypeOverride: mediaType,
          genreNameMap,
        }),
      ),
      source: "live",
      notice: null,
    };
  } catch (error) {
    return {
      ...basePagedResult("live"),
      notice: getListFailureNotice(error),
    };
  }
}

export async function discoverTitles(
  input: DiscoverTitlesInput,
): Promise<PagedResult<TitleSummary>> {
  if (env.tmdbUseMockData) {
    return {
      ...discoverMockTitles(input),
      source: "mock",
      notice: null,
    };
  }

  const mediaType = input.mediaType ?? "movie";
  const notices: string[] = [];

  try {
    const genreCatalog = await getGenreCatalog(mediaType);
    const genreId = input.genre
      ? genreCatalog.find((genre) => genre.name === input.genre)?.id
      : undefined;

    if (input.genre && !genreId) {
      notices.push("The selected genre filter could not be matched, so it was skipped.");
    }

    let providerId: number | null | undefined;
    if (input.provider) {
      providerId = await getProviderIdByName(input.provider, mediaType);

      if (!providerId) {
        notices.push(
          `The ${input.provider} filter could not be applied for ${env.tmdbWatchRegion}, so results may be broader than expected.`,
        );
      }
    }

    const request = buildDiscoverRequest(input, {
      genreId,
      providerId,
    });
    const response = await tmdbFetch<TMDbPagedResponse>(request.path, request.params);
    const genreNameMap = buildGenreNameMap(genreCatalog);

    return {
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      results: response.results.map((result) =>
        normalizeTitleSummary(result, {
          mediaTypeOverride: mediaType,
          genreNameMap,
        }),
      ),
      source: "live",
      notice: notices.length > 0 ? notices.join(" ") : null,
    };
  } catch (error) {
    return {
      ...basePagedResult("live"),
      notice: [notices.join(" "), getListFailureNotice(error)]
        .filter(Boolean)
        .join(" "),
    };
  }
}

export async function getTitleDetails(
  tmdbId: number,
  mediaType: MediaTypeKey,
): Promise<TitleDetailsResult> {
  if (env.tmdbUseMockData) {
    const detail = getMockTitleDetails(tmdbId, mediaType);

    return {
      data: detail,
      notice: null,
      notFound: !detail,
      source: "mock",
    };
  }

  try {
    const detail = await tmdbFetch<TMDbDetailResult>(`/${mediaType}/${tmdbId}`, {
      append_to_response: "credits",
    });

    let providerAvailability: NormalizedProviderAvailability = {
      providers: [],
      providerStatus: "unknown",
    };
    let providerNotice: string | null = null;

    try {
      providerAvailability = await getTitleProviderAvailability(tmdbId, mediaType);
    } catch {
      providerNotice = `Provider availability for ${env.tmdbWatchRegion} is temporarily unavailable.`;
    }

    return {
      data: {
        ...normalizeTitleSummary(detail, {
          mediaTypeOverride: mediaType,
          providers: providerAvailability.providers,
          providerStatus: providerAvailability.providerStatus,
        }),
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
      },
      notice: providerNotice,
      notFound: false,
      source: "live",
    };
  } catch (error) {
    if (error instanceof TMDbRequestError && error.kind === "not_found") {
      return {
        data: null,
        notice: null,
        notFound: true,
        source: "live",
      };
    }

    const cached = await getFreshTitleDetailsFromCache(
      tmdbId,
      mediaType,
      TITLE_DETAIL_CACHE_TTL_MS,
    );

    if (cached) {
      return {
        data: cached,
        notice: getDetailFailureNotice(error, true),
        notFound: false,
        source: "cache",
      };
    }

    return {
      data: null,
      notice: getDetailFailureNotice(error, false),
      notFound: false,
      source: "live",
    };
  }
}

async function runConcurrent<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = await Promise.all(tasks.slice(i, i + concurrency).map((fn) => fn()));
    results.push(...batch);
  }
  return results;
}

export async function hydrateProvidersForTitles(
  titles: TitleSummary[],
  options?: { refreshStale?: boolean },
): Promise<TitleSummary[]> {
  if (env.tmdbUseMockData) {
    return titles;
  }

  const cachedProviders = await getFreshTitleProviderSnapshots(
    titles.map((title) => ({
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
    })),
    TITLE_PROVIDER_TTL_MS,
  );

  const tasks = titles.map((title) => async () => {
    const existingProviders = title.providers.length > 0;
    const cached = cachedProviders.get(toTmdbKey(title.tmdbId, title.mediaType));
    if (cached) {
      return {
        ...title,
        providers: cached.providers,
        providerStatus: cached.providerStatus,
      };
    }

    if (
      !options?.refreshStale &&
      existingProviders &&
      title.providerStatus !== "unknown"
    ) {
      return title;
    }

    try {
      const providerAvailability = await getTitleProviderAvailability(
        title.tmdbId,
        title.mediaType,
      );

      return {
        ...title,
        providers: providerAvailability.providers,
        providerStatus: providerAvailability.providerStatus,
      };
    } catch {
      return {
        ...title,
        providers: title.providers,
        providerStatus: title.providerStatus ?? "unknown",
      };
    }
  });

  return runConcurrent(tasks, TMDB_PROVIDER_CONCURRENCY);
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
    dedupeByKey(combined, (title) => `${title.mediaType}:${title.tmdbId}`),
  );
}

export async function getGenreOptions(mediaType: MediaTypeKey = "movie") {
  if (env.tmdbUseMockData) {
    return MOCK_GENRES;
  }

  const genreCatalog = await getGenreCatalog(mediaType);
  return sortCatalogEntriesByName(genreCatalog.map((genre) => genre.name));
}

export async function getProviderOptions(mediaType: MediaTypeKey | "all" = "all") {
  if (env.tmdbUseMockData) {
    return PROVIDER_OPTIONS;
  }

  if (mediaType === "all") {
    const [movieProviders, tvProviders] = await Promise.all([
      getProviderCatalog("movie"),
      getProviderCatalog("tv"),
    ]);

    return sortCatalogEntriesByName(
      dedupeByKey([...movieProviders, ...tvProviders], (provider) => provider.name).map(
        (provider) => provider.name,
      ),
    );
  }

  const providers = await getProviderCatalog(mediaType);
  return sortCatalogEntriesByName(providers.map((provider) => provider.name));
}
