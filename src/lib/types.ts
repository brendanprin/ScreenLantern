export type MediaTypeKey = "movie" | "tv";
export type RecommendationModeKey = "SOLO" | "GROUP";
export type ReminderAggressivenessKey = "LIGHT" | "BALANCED" | "PROACTIVE";
export type SharedWatchlistScopeKey = "GROUP" | "HOUSEHOLD";
export type TraktSyncStatusKey = "SUCCESS" | "ERROR" | "NEEDS_REAUTH";
export type TraktSyncModeKey = "OFF" | "DAILY" | "ON_LOGIN_OR_APP_OPEN";
export type TraktSyncTriggerKey = "MANUAL" | "AUTOMATIC";
export type TraktFreshnessStateKey = "FRESH" | "STALE" | "NEVER_SYNCED";
export type LibrarySourceFilter = "all" | "imported" | "manual";
export type PersonalInteractionOrigin = "manual" | "trakt" | "netflix";
export type HouseholdActivityTypeKey =
  | "SHARED_SAVE_ADDED"
  | "SHARED_SAVE_REMOVED"
  | "GROUP_WATCH_RECORDED"
  | "INVITE_CREATED"
  | "INVITE_REVOKED"
  | "INVITE_REDEEMED"
  | "OWNERSHIP_TRANSFERRED"
  | "MEMBER_REMOVED";

export interface ProviderInfo {
  id?: number;
  name: string;
  logoPath?: string | null;
  type?: string;
}

export type ProviderAvailabilityStatus = "available" | "unavailable" | "unknown";
export type CatalogResultSource = "live" | "mock" | "cache";
export type SelectedServiceAvailability =
  | "selected_services"
  | "other_services"
  | "unavailable"
  | "unknown";
export type ProviderHandoffStatus =
  | "openable"
  | "availability_only"
  | "unavailable"
  | "unknown";
export type ProviderHandoffKind =
  | "title_direct"
  | "provider_search"
  | "provider_home";

export interface ProviderHandoffEntry {
  providerName: string;
  availabilityLabel?: string | null;
  isSelectedService: boolean;
  handoffUrl?: string | null;
  handoffKind?: ProviderHandoffKind | null;
}

export interface TitleHandoffSummary {
  status: ProviderHandoffStatus;
  region: string;
  selectedAvailability: SelectedServiceAvailability;
  primaryOption: ProviderHandoffEntry | null;
  openableOptions: ProviderHandoffEntry[];
  entries: ProviderHandoffEntry[];
  fallbackMessage?: string | null;
}

export interface PersonalInteractionSourceState {
  WATCHLIST?: PersonalInteractionOrigin | null;
  WATCHED?: PersonalInteractionOrigin | null;
  LIKE?: PersonalInteractionOrigin | null;
  DISLIKE?: PersonalInteractionOrigin | null;
  HIDE?: PersonalInteractionOrigin | null;
}

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
  handoff?: TitleHandoffSummary | null;
}

export type RecommendationLaneId = "available_now" | "back_on_your_radar";

export type WatchlistResurfaceSource =
  | "personal"
  | "shared_group"
  | "shared_household";

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

export type TitleFitMemberTone = "strong" | "good" | "neutral" | "conflict";
export type TitleFitSummaryTone =
  | "solo_strong"
  | "solo_good"
  | "solo_mixed"
  | "solo_conflict"
  | "group_strong_overlap"
  | "group_safe_compromise"
  | "group_mixed"
  | "group_conflict"
  | "group_rewatch"
  | "household_planning";

export interface TitleFitMemberSignal {
  id: string;
  name: string;
  isActiveContextMember: boolean;
  tone: TitleFitMemberTone;
  label: string;
  detail: string;
  chips: string[];
}

export interface TitleFitSummary {
  tone: TitleFitSummaryTone;
  badge: string;
  headline: string;
  detail: string;
  supportNote?: string | null;
  bestForLabel?: string | null;
  contextLabel: string;
  isGroupMode: boolean;
  isWatchedByCurrentGroup: boolean;
  members: TitleFitMemberSignal[];
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

export interface ReminderPreferences {
  enableAvailableNow: boolean;
  enableWatchlistResurface: boolean;
  enableGroupWatchCandidate: boolean;
  enableSoloReminders: boolean;
  enableGroupReminders: boolean;
  aggressiveness: ReminderAggressivenessKey;
  allowDismissedReappear: boolean;
}

export interface TraktConnectionSummary {
  isAvailable: boolean;
  isConnected: boolean;
  isMockMode: boolean;
  traktUsername?: string | null;
  syncMode: TraktSyncModeKey;
  lastSyncTrigger?: TraktSyncTriggerKey | null;
  lastSyncAttemptedAt?: string | null;
  lastSyncedAt?: string | null;
  lastSyncStatus?: TraktSyncStatusKey | null;
  lastSyncError?: string | null;
  freshnessState: TraktFreshnessStateKey;
  freshnessMessage: string;
  importedScopes: string[];
  disconnectKeepsImportedData: boolean;
  lastSyncReview?: TraktSyncReview | null;
}

export type TraktRecentImportKind =
  | "WATCHED"
  | "WATCHLIST"
  | "LIKE"
  | "DISLIKE";

export interface TraktRecentImportItem {
  tmdbId: number;
  mediaType: MediaTypeKey;
  title: string;
  kind: TraktRecentImportKind;
  importedAt?: string | null;
}

export interface TraktLastSyncSummary {
  trigger: TraktSyncTriggerKey;
  changed: boolean;
  imported: {
    watched: number;
    watchlist: number;
    likes: number;
    dislikes: number;
  };
  cleared: {
    watched: number;
    watchlist: number;
    ratings: number;
  };
  skippedWithoutTmdb: number;
  recentImports: TraktRecentImportItem[];
}

export interface TraktSyncReview {
  state: "never_synced" | "success" | "no_changes" | "failed";
  triggerLabel?: string | null;
  headline: string;
  detail: string;
  skippedNote?: string | null;
  recentImports: TraktRecentImportItem[];
}

export interface TraktSyncResult {
  syncedAt: string;
  trigger: TraktSyncTriggerKey;
  changed: boolean;
  imported: {
    watched: number;
    watchlist: number;
    likes: number;
    dislikes: number;
  };
  cleared: {
    watched: number;
    watchlist: number;
    ratings: number;
  };
  skippedWithoutTmdb: number;
  recentImports: TraktRecentImportItem[];
}

export interface TraktAutoSyncResult {
  outcome: "synced" | "skipped" | "failed";
  reason:
    | "not_connected"
    | "disabled"
    | "manual_bootstrap_required"
    | "fresh_enough"
    | "backoff"
    | "needs_reauth"
    | "never_synced"
    | "stale"
    | "error";
  result?: TraktSyncResult;
  error?: string | null;
}

export interface ReminderInboxResult {
  contextLabel: string;
  mode: RecommendationModeKey;
  isGroupMode: boolean;
  unreadCount: number;
  items: ReminderItem[];
  tuningNote?: string | null;
}

export interface HouseholdActivityItem {
  id: string;
  type: HouseholdActivityTypeKey;
  summary: string;
  detail?: string | null;
  contextLabel?: string | null;
  createdAt: string;
  actorName?: string | null;
  title?: {
    title: string;
    mediaType: MediaTypeKey;
    href: string;
  } | null;
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

export interface SharedWatchlistPresence {
  isSaved: boolean;
  isSavedByViewer: boolean;
  savedByNames: string[];
  contextLabel: string;
}

export interface SharedWatchlistTitleState {
  group: SharedWatchlistPresence | null;
  household: SharedWatchlistPresence | null;
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

export type AssistantConversationRole = "user" | "assistant";
export type AssistantRuntimeMode = "mock" | "openai" | "ollama";
export type AssistantMoodKey =
  | "funny"
  | "lighter"
  | "tense"
  | "romantic"
  | "scary"
  | "thoughtful";
export type AssistantCandidateSource =
  | "recommendation"
  | "watchlist"
  | "shared_group"
  | "shared_household"
  | "library"
  | "search";

export interface AssistantContextSnapshot {
  label: string;
  mode: RecommendationModeKey;
  isGroupMode: boolean;
  selectedUserIds: string[];
  savedGroupId: string | null;
}

export interface AssistantMessageCard {
  id: string;
  source: AssistantCandidateSource;
  sourceLabel: string;
  title: TitleSummary;
  handoff: TitleHandoffSummary | null;
  recommendationExplanations: RecommendationExplanation[];
  recommendationBadges: string[];
  recommendationContextLabel?: string | null;
  fitSummaryLabel?: string | null;
  personalSourceBadge?: string | null;
}

export interface AssistantConversationMessage {
  id: string;
  role: AssistantConversationRole;
  text: string;
  createdAt: string;
  cards: AssistantMessageCard[];
}

export interface AssistantConversationSnapshot {
  isMockMode: boolean;
  runtimeMode: AssistantRuntimeMode;
  providerLabel: string;
  context: AssistantContextSnapshot;
  messages: AssistantConversationMessage[];
}
