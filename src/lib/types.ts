export type MediaTypeKey = "movie" | "tv";

export interface ProviderInfo {
  id?: number;
  name: string;
  logoPath?: string | null;
  type?: string;
}

export interface TitleSummary {
  tmdbId: number;
  mediaType: MediaTypeKey;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  runtimeMinutes?: number | null;
  genres: string[];
  voteAverage?: number | null;
  popularity?: number | null;
  providers: ProviderInfo[];
}

export interface TitleDetails extends TitleSummary {
  cast: Array<{
    name: string;
    character?: string | null;
  }>;
  seasons: Array<{
    seasonNumber: number;
    name: string;
    episodeCount: number;
  }>;
  status?: string | null;
  originCountries?: string[];
}

export interface PagedResult<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

export interface SearchTitlesInput {
  query: string;
  page?: number;
  mediaType?: "all" | MediaTypeKey;
}

export interface DiscoverTitlesInput {
  page?: number;
  mediaType?: MediaTypeKey;
  genre?: string;
  year?: number;
  runtimeMax?: number;
  provider?: string;
  sortBy?: "popularity.desc" | "vote_average.desc" | "primary_release_date.desc";
}

export interface RecommendationItem {
  title: TitleSummary;
  score: number;
  reasons: string[];
}

export interface TasteProfile {
  userIds: string[];
  preferredGenres: Array<{ genre: string; score: number }>;
  preferredProviders: string[];
  preferredMediaType: MediaTypeKey | "mixed";
  runtimePreference: "short" | "medium" | "long" | "mixed";
  dislikedTmdbKeys: string[];
  hiddenTmdbKeys: string[];
  watchedTmdbKeys: string[];
}

