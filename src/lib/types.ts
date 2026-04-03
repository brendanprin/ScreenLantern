export type MediaTypeKey = "movie" | "tv";
export type RecommendationModeKey = "SOLO" | "GROUP";

export interface ProviderInfo {
  id?: number;
  name: string;
  logoPath?: string | null;
  type?: string;
}

export type ProviderAvailabilityStatus = "available" | "unavailable" | "unknown";
export type CatalogResultSource = "live" | "mock" | "cache";

export interface TitleSummary {
  tmdbId: number;
  mediaType: MediaTypeKey;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  releaseYear?: number | null;
  runtimeMinutes?: number | null;
  genres: string[];
  voteAverage?: number | null;
  popularity?: number | null;
  providers: ProviderInfo[];
  providerStatus?: ProviderAvailabilityStatus;
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
  notice?: string | null;
  source?: CatalogResultSource;
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
  sortBy?: "popularity.desc" | "vote_average.desc" | "newest.desc";
}

export interface TitleDetailsResult {
  data: TitleDetails | null;
  notice?: string | null;
  notFound?: boolean;
  source?: CatalogResultSource;
}

export interface RecommendationItem {
  title: TitleSummary;
  score: number;
  explanations: RecommendationExplanation[];
  badges?: string[];
}

export type RecommendationLaneId = "available_now" | "back_on_your_radar";

export interface RecommendationLane {
  id: RecommendationLaneId;
  title: string;
  description: string;
  items: RecommendationItem[];
}

export type ReminderCategoryKey =
  | "available_now"
  | "watchlist_resurface"
  | "group_watch_candidate";

export type RecommendationExplanationCategory =
  | "genre_overlap"
  | "group_overlap"
  | "provider_match"
  | "runtime_fit"
  | "media_fit"
  | "watchlist_resurface"
  | "watch_history"
  | "group_watch_history"
  | "fresh_group_pick"
  | "fallback";

export interface RecommendationExplanation {
  category: RecommendationExplanationCategory;
  summary: string;
  detail?: string | null;
}

export interface ReminderItem {
  id: string;
  category: ReminderCategoryKey;
  title: TitleSummary;
  contextLabel: string;
  mode: RecommendationModeKey;
  summary: string;
  detail?: string | null;
  explanations: RecommendationExplanation[];
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  href: string;
  badges?: string[];
}

export interface ReminderInboxResult {
  contextLabel: string;
  mode: RecommendationModeKey;
  isGroupMode: boolean;
  unreadCount: number;
  items: ReminderItem[];
}

export interface HouseholdMemberOption {
  id: string;
  name: string;
}

export interface SavedGroupOption {
  id: string;
  name: string;
  userIds: string[];
}

export type RecommendationContextSource =
  | "solo_profile"
  | "saved_group"
  | "ad_hoc_group";

export interface PersistedRecommendationContext {
  mode: RecommendationModeKey;
  selectedUserIds: string[];
  savedGroupId: string | null;
  source: RecommendationContextSource;
  activeNames: string[];
  isGroupMode: boolean;
}

export interface GroupWatchState {
  isWatchedByCurrentGroup: boolean;
  watchedAt?: string | null;
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
