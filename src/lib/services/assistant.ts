import { InteractionType } from "@prisma/client";
import { z } from "zod";

import { deriveCompactFitLabel } from "@/lib/fit-labels";
import { env } from "@/lib/env";
import {
  getLibrarySourceBadge,
  getPersonalInteractionOriginLabel,
} from "@/lib/personal-interaction-sources";
import { prisma } from "@/lib/prisma";
import { getTitleDetails, hydrateProvidersForTitles, searchTitles } from "@/lib/services/catalog";
import {
  getInteractionMap,
  getInteractionSourceStateMap,
} from "@/lib/services/interactions";
import {
  getLibraryWorkspace,
  type LibraryCollection,
  type LibraryFocus,
  type LibrarySectionItem,
  type LibrarySource,
} from "@/lib/services/library";
import { buildTitleHandoff } from "@/lib/services/provider-handoff";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";
import {
  classifySelectedServiceAvailability,
  getRecommendedTitles,
} from "@/lib/services/recommendations";
import { resolveAssistantRuntimeConfig } from "@/lib/services/assistant-runtime";
import { toTmdbKey, upsertTitleCache } from "@/lib/services/title-cache";
import { getTitleFitSummary } from "@/lib/services/title-fit";
import { getTraktConnectionSummary } from "@/lib/services/trakt";
import type {
  AssistantCandidateSource,
  AssistantContextSnapshot,
  AssistantConversationMessage,
  AssistantConversationSnapshot,
  AssistantMessageCard,
  AssistantMoodKey,
  MediaTypeKey,
  RecommendationExplanation,
  RecommendationModeKey,
  TitleSummary,
  TraktSyncReview,
} from "@/lib/types";

const MAX_STORED_MESSAGES = 14;
const MAX_TOOL_ROUNDS = 4;
const DEFAULT_CARD_LIMIT = 3;
const MAX_TOOL_CARD_COUNT = 6;

const assistantMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: z.string(),
  cards: z.array(
    z.object({
      id: z.string(),
      source: z.enum([
        "recommendation",
        "watchlist",
        "shared_group",
        "shared_household",
        "library",
        "search",
      ]),
      sourceLabel: z.string(),
      title: z.object({
        tmdbId: z.number(),
        mediaType: z.enum(["movie", "tv"]),
        title: z.string(),
        overview: z.string(),
        posterPath: z.string().nullable(),
        backdropPath: z.string().nullable(),
        releaseDate: z.string().nullable(),
        releaseYear: z.number().nullable().optional(),
        runtimeMinutes: z.number().nullable().optional(),
        genres: z.array(z.string()),
        voteAverage: z.number().nullable().optional(),
        popularity: z.number().nullable().optional(),
        providers: z.array(
          z.object({
            id: z.number().optional(),
            name: z.string(),
            logoPath: z.string().nullable().optional(),
            type: z.string().optional(),
          }),
        ),
        providerStatus: z.enum(["available", "unavailable", "unknown"]).optional(),
      }),
      handoff: z.any().nullable(),
      recommendationExplanations: z.array(
        z.object({
          category: z.enum([
            "genre_overlap",
            "group_overlap",
            "provider_match",
            "runtime_fit",
            "media_fit",
            "watchlist_resurface",
            "watch_history",
            "group_watch_history",
            "fresh_group_pick",
            "fallback",
          ]),
          summary: z.string(),
          detail: z.string().nullable().optional(),
        }),
      ),
      recommendationBadges: z.array(z.string()),
      recommendationContextLabel: z.string().nullable().optional(),
      fitSummaryLabel: z.string().nullable().optional(),
      personalSourceBadge: z.string().nullable().optional(),
    }),
  ),
});

const assistantContextSchema = z.object({
  label: z.string(),
  mode: z.enum(["SOLO", "GROUP"]),
  isGroupMode: z.boolean(),
  selectedUserIds: z.array(z.string()),
  savedGroupId: z.string().nullable(),
});

type StoredAssistantMessage = z.infer<typeof assistantMessageSchema>;
interface AssistantViewer {
  userId: string;
  householdId: string;
  name: string;
  email: string;
  preferredProviders: string[];
}

interface AssistantRuntimeContext {
  viewer: AssistantViewer;
  context: AssistantContextSnapshot;
  activeNames: string[];
  preferredProviders: string[];
  traktReview: TraktSyncReview | null;
  traktConnected: boolean;
}

interface AssistantToolArgs {
  limit?: number | null;
  mediaType?: MediaTypeKey | null;
  runtimeMax?: number | null;
  onlyOnPreferredProviders?: boolean | null;
  provider?: string | null;
  mood?: AssistantMoodKey | null;
  referenceTmdbId?: number | null;
  referenceMediaType?: MediaTypeKey | null;
  excludeWatched?: boolean | null;
}

interface AssistantToolExecutionContext {
  recentlySuggestedKeys: Set<string>;
}

interface AssistantNegativeInteractionFlags {
  hasHidden: boolean;
  hasDisliked: boolean;
}

interface AssistantRecommendationToolArgs extends AssistantToolArgs {
  limit?: number | null;
}

interface AssistantSearchToolArgs {
  query: string;
  mediaType?: MediaTypeKey | null;
  limit?: number | null;
}

interface AssistantFitToolArgs {
  tmdbId: number;
  mediaType: MediaTypeKey;
}

interface AssistantWatchlistToolArgs extends AssistantToolArgs {
  scope: "personal" | "shared_current" | "shared_household";
}

interface AssistantLibraryToolArgs extends AssistantToolArgs {
  collection?: LibraryCollection | null;
  focus?: LibraryFocus | null;
  source?: LibrarySource | null;
}

interface RecommendationToolPayload {
  cards: AssistantMessageCard[];
  summary: string;
}

interface SearchToolPayload {
  results: Array<{
    tmdbId: number;
    mediaType: MediaTypeKey;
    title: string;
    releaseYear: number | null | undefined;
    providers: string[];
  }>;
}

interface FitToolPayload {
  headline: string;
  detail: string;
  bestForLabel?: string | null;
  cards: AssistantMessageCard[];
}

interface ActiveContextToolPayload {
  label: string;
  mode: RecommendationModeKey;
  selectedUsers: string[];
  preferredProviders: string[];
  traktConnected: boolean;
  traktReviewHeadline?: string | null;
}

type AssistantToolPayload =
  | RecommendationToolPayload
  | SearchToolPayload
  | FitToolPayload
  | ActiveContextToolPayload;

interface AssistantTurnResult {
  text: string;
  cards: AssistantMessageCard[];
}

interface AssistantOpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

function normalizeLooseText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeMediaTypeValue(value: unknown): MediaTypeKey | null | undefined {
  if (value == null || value === "") {
    return null;
  }

  if (value === "movie" || value === "tv") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = normalizeLooseText(value);

  if (
    normalized.includes("movie") ||
    normalized.includes("film") ||
    normalized.includes("feature")
  ) {
    return "movie";
  }

  if (
    normalized.includes("tv") ||
    normalized.includes("show") ||
    normalized.includes("series") ||
    normalized.includes("episode") ||
    normalized.includes("television")
  ) {
    return "tv";
  }

  return null;
}

export function normalizeMoodValue(value: unknown): AssistantMoodKey | null | undefined {
  if (value == null || value === "") {
    return null;
  }

  if (
    value === "funny" ||
    value === "lighter" ||
    value === "tense" ||
    value === "romantic" ||
    value === "scary" ||
    value === "thoughtful"
  ) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = normalizeLooseText(value);

  if (
    normalized.includes("rom com") ||
    normalized.includes("romcom") ||
    normalized.includes("romantic comedy") ||
    normalized.includes("romance") ||
    normalized.includes("romantic")
  ) {
    return "romantic";
  }

  if (normalized.includes("funny") || normalized.includes("comedy") || normalized.includes("light")) {
    return normalized.includes("light") ? "lighter" : "funny";
  }

  if (normalized.includes("tense") || normalized.includes("thriller")) {
    return "tense";
  }

  if (normalized.includes("scary") || normalized.includes("horror")) {
    return "scary";
  }

  if (
    normalized.includes("thoughtful") ||
    normalized.includes("smart") ||
    normalized.includes("reflective")
  ) {
    return "thoughtful";
  }

  return null;
}

export function normalizeRecommendationLikeArgs(rawArgs: unknown) {
  if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return rawArgs;
  }

  const normalized = { ...rawArgs } as Record<string, unknown>;

  if ("mediaType" in normalized) {
    const originalMediaType = normalized.mediaType;
    const parsedMediaType = normalizeMediaTypeValue(originalMediaType);
    normalized.mediaType = parsedMediaType ?? null;

    if (
      parsedMediaType == null &&
      normalized.mood == null &&
      typeof originalMediaType === "string"
    ) {
      const inferredMood = normalizeMoodValue(originalMediaType);
      if (inferredMood) {
        normalized.mood = inferredMood;
      }
    }
  }

  if ("referenceMediaType" in normalized) {
    normalized.referenceMediaType =
      normalizeMediaTypeValue(normalized.referenceMediaType) ?? null;
  }

  if ("mood" in normalized) {
    normalized.mood = normalizeMoodValue(normalized.mood) ?? null;
  }

  return normalized;
}

export function normalizeSearchArgs(rawArgs: unknown) {
  if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return rawArgs;
  }

  const normalized = { ...rawArgs } as Record<string, unknown>;

  if ("mediaType" in normalized) {
    normalized.mediaType = normalizeMediaTypeValue(normalized.mediaType) ?? null;
  }

  return normalized;
}

function normalizeFitArgs(rawArgs: unknown) {
  if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return rawArgs;
  }

  const normalized = { ...rawArgs } as Record<string, unknown>;

  if ("mediaType" in normalized) {
    const mediaType = normalizeMediaTypeValue(normalized.mediaType);
    if (mediaType) {
      normalized.mediaType = mediaType;
    }
  }

  return normalized;
}

const recommendationArgsSchema = z.object({
  limit: z.number().int().min(1).max(MAX_TOOL_CARD_COUNT).nullish(),
  mediaType: z.enum(["movie", "tv"]).nullish(),
  runtimeMax: z.number().int().positive().max(400).nullish(),
  onlyOnPreferredProviders: z.boolean().nullish(),
  provider: z.string().trim().min(1).max(80).nullish(),
  mood: z
    .enum(["funny", "lighter", "tense", "romantic", "scary", "thoughtful"])
    .nullish(),
  referenceTmdbId: z.number().int().positive().nullish(),
  referenceMediaType: z.enum(["movie", "tv"]).nullish(),
  excludeWatched: z.boolean().nullish(),
});

const searchArgsSchema = z.object({
  query: z.string().trim().min(1).max(120),
  mediaType: z.enum(["movie", "tv"]).nullish(),
  limit: z.number().int().min(1).max(5).nullish(),
});

const fitArgsSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
});

const watchlistArgsSchema = recommendationArgsSchema.extend({
  scope: z.enum(["personal", "shared_current", "shared_household"]),
});

const libraryArgsSchema = recommendationArgsSchema.extend({
  collection: z
    .enum([
      "overview",
      "WATCHLIST",
      "WATCHED",
      "LIKE",
      "DISLIKE",
      "HIDE",
      "shared_group",
      "shared_household",
    ])
    .nullish(),
  focus: z.enum(["all", "available", "movies", "shows", "unwatched"]).nullish(),
  source: z.enum(["all", "imported", "manual"]).nullish(),
});

function createMessage(
  role: AssistantConversationMessage["role"],
  text: string,
  cards: AssistantMessageCard[] = [],
): AssistantConversationMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    cards,
    createdAt: new Date().toISOString(),
  };
}

function parseStoredMessages(input: unknown): AssistantConversationMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((message) => assistantMessageSchema.safeParse(message))
    .filter((result): result is { success: true; data: StoredAssistantMessage } => result.success)
    .map((result) => result.data as AssistantConversationMessage);
}

function parseStoredContext(input: unknown): AssistantContextSnapshot | null {
  const parsed = assistantContextSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function buildContextLabel(activeNames: string[], isGroupMode: boolean, viewerName: string) {
  if (isGroupMode) {
    return activeNames.join(" + ") || "this group";
  }

  return activeNames[0] ?? viewerName;
}

function buildAssistantContextSnapshot(args: {
  activeNames: string[];
  mode: RecommendationModeKey;
  isGroupMode: boolean;
  selectedUserIds: string[];
  savedGroupId: string | null;
  viewerName: string;
}): AssistantContextSnapshot {
  return {
    label: buildContextLabel(args.activeNames, args.isGroupMode, args.viewerName),
    mode: args.mode,
    isGroupMode: args.isGroupMode,
    selectedUserIds: args.selectedUserIds,
    savedGroupId: args.savedGroupId,
  };
}

async function buildRuntimeContext(viewer: AssistantViewer): Promise<AssistantRuntimeContext> {
  const bootstrap = await getRecommendationContextBootstrap({
    userId: viewer.userId,
    householdId: viewer.householdId,
  });
  const selectedMembers = await prisma.user.findMany({
    where: {
      householdId: viewer.householdId,
      id: {
        in: bootstrap.context.selectedUserIds,
      },
    },
    select: {
      preferredProviders: true,
    },
  });
  const traktSummary = await getTraktConnectionSummary({
    userId: viewer.userId,
    householdId: viewer.householdId,
  });
  const preferredProviders = [
    ...new Set(selectedMembers.flatMap((member) => member.preferredProviders)),
  ];

  return {
    viewer,
    context: buildAssistantContextSnapshot({
      activeNames: bootstrap.context.activeNames,
      mode: bootstrap.context.mode,
      isGroupMode: bootstrap.context.isGroupMode,
      selectedUserIds: bootstrap.context.selectedUserIds,
      savedGroupId: bootstrap.context.savedGroupId,
      viewerName: viewer.name,
    }),
    activeNames: bootstrap.context.activeNames,
    preferredProviders,
    traktConnected: traktSummary.isConnected,
    traktReview: traktSummary.lastSyncReview ?? null,
  };
}

function trimMessages(messages: AssistantConversationMessage[]) {
  return messages.slice(-MAX_STORED_MESSAGES);
}

async function persistConversation(args: {
  viewer: AssistantViewer;
  messages: AssistantConversationMessage[];
  context: AssistantContextSnapshot;
}) {
  await prisma.aiConversation.upsert({
    where: {
      userId: args.viewer.userId,
    },
    update: {
      householdId: args.viewer.householdId,
      messagesJson: args.messages as unknown as object,
      lastContextJson: args.context as unknown as object,
    },
    create: {
      userId: args.viewer.userId,
      householdId: args.viewer.householdId,
      messagesJson: args.messages as unknown as object,
      lastContextJson: args.context as unknown as object,
    },
  });
}

function normalizeProviderName(value: string) {
  return value
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function providerMatches(title: TitleSummary, provider: string) {
  const normalizedProvider = normalizeProviderName(provider);
  return title.providers.some(
    (candidate) => normalizeProviderName(candidate.name) === normalizedProvider,
  );
}

function buildFallbackExplanation(summary: string, detail?: string | null): RecommendationExplanation[] {
  return [
    {
      category: "fallback",
      summary,
      detail: detail ?? null,
    },
  ];
}

function moodAdjustment(title: TitleSummary, mood?: AssistantMoodKey | null) {
  if (!mood) {
    return 0;
  }

  const genres = new Set(title.genres.map((genre) => genre.toLowerCase()));

  if (mood === "funny" || mood === "lighter") {
    let score = 0;
    if (genres.has("comedy")) score += 35;
    if (genres.has("family") || genres.has("animation")) score += 20;
    if (genres.has("thriller") || genres.has("horror")) score -= 25;
    return score;
  }

  if (mood === "tense") {
    let score = 0;
    if (genres.has("thriller") || genres.has("mystery")) score += 28;
    if (genres.has("crime") || genres.has("drama")) score += 12;
    if (genres.has("family")) score -= 15;
    return score;
  }

  if (mood === "romantic") {
    let score = 0;
    if (genres.has("romance")) score += 35;
    if (genres.has("comedy") || genres.has("drama")) score += 12;
    return score;
  }

  if (mood === "scary") {
    let score = 0;
    if (genres.has("horror")) score += 35;
    if (genres.has("thriller")) score += 15;
    return score;
  }

  if (mood === "thoughtful") {
    let score = 0;
    if (genres.has("drama") || genres.has("science fiction")) score += 20;
    if (genres.has("mystery") || genres.has("documentary")) score += 12;
    return score;
  }

  return 0;
}

function referenceAdjustment(
  title: TitleSummary,
  reference: TitleSummary | null,
) {
  if (!reference) {
    return 0;
  }

  let score = 0;
  if (title.mediaType === reference.mediaType) {
    score += 18;
  }

  const referenceGenres = new Set(reference.genres);
  const sharedGenres = title.genres.filter((genre) => referenceGenres.has(genre));
  score += sharedGenres.length * 12;

  if (
    typeof title.runtimeMinutes === "number" &&
    typeof reference.runtimeMinutes === "number"
  ) {
    const runtimeDelta = Math.abs(title.runtimeMinutes - reference.runtimeMinutes);
    if (runtimeDelta <= 20) {
      score += 10;
    } else if (runtimeDelta <= 45) {
      score += 5;
    }
  }

  return score;
}

async function buildWatchMap(
  selectedUserIds: string[],
  titles: TitleSummary[],
) {
  const interactionMaps = await Promise.all(
    selectedUserIds.map((userId) =>
      getInteractionMap(
        userId,
        titles.map((title) => ({
          tmdbId: title.tmdbId,
          mediaType: title.mediaType,
        })),
      ),
    ),
  );

  const map = new Map<string, number>();
  titles.forEach((title) => {
    const key = toTmdbKey(title.tmdbId, title.mediaType);
    const watchedCount = interactionMaps.reduce((count, interactionMap) => {
      const hasWatched = (interactionMap.get(key) ?? []).includes(InteractionType.WATCHED);
      return count + (hasWatched ? 1 : 0);
    }, 0);

    map.set(key, watchedCount);
  });

  return map;
}

async function buildNegativeInteractionMap(
  selectedUserIds: string[],
  titles: TitleSummary[],
) {
  const interactionMaps = await Promise.all(
    selectedUserIds.map((userId) =>
      getInteractionMap(
        userId,
        titles.map((title) => ({
          tmdbId: title.tmdbId,
          mediaType: title.mediaType,
        })),
      ),
    ),
  );

  const map = new Map<string, AssistantNegativeInteractionFlags>();
  titles.forEach((title) => {
    const key = toTmdbKey(title.tmdbId, title.mediaType);
    const flags = interactionMaps.reduce(
      (state, interactionMap) => {
        const interactions = interactionMap.get(key) ?? [];

        return {
          hasHidden: state.hasHidden || interactions.includes(InteractionType.HIDE),
          hasDisliked: state.hasDisliked || interactions.includes(InteractionType.DISLIKE),
        };
      },
      { hasHidden: false, hasDisliked: false },
    );

    map.set(key, flags);
  });

  return map;
}

export function hasNegativeAssistantInteraction(flags: AssistantNegativeInteractionFlags) {
  return flags.hasHidden || flags.hasDisliked;
}

function buildAssistantTitleKey(title: Pick<TitleSummary, "tmdbId" | "mediaType">) {
  return toTmdbKey(title.tmdbId, title.mediaType);
}

export function collectRecentlySuggestedKeys(
  messages: AssistantConversationMessage[],
  maxAssistantMessages = 2,
) {
  const recentAssistantMessages = [...messages]
    .reverse()
    .filter((message) => message.role === "assistant" && message.cards.length > 0)
    .slice(0, maxAssistantMessages);

  return new Set(
    recentAssistantMessages.flatMap((message) =>
      message.cards.map((card) => buildAssistantTitleKey(card.title)),
    ),
  );
}

async function applyTitleFilters(
  runtime: AssistantRuntimeContext,
  titles: Array<{
    title: TitleSummary;
    score: number;
    explanations: RecommendationExplanation[];
    badges?: string[];
    source: AssistantCandidateSource;
    sourceLabel: string;
    personalSourceBadge?: string | null;
  }>,
  args: AssistantToolArgs,
  executionContext?: AssistantToolExecutionContext,
) {
  const reference =
    typeof args.referenceTmdbId === "number" && args.referenceMediaType
      ? (await getTitleDetails(args.referenceTmdbId, args.referenceMediaType)).data
      : null;

  const watchMap = await buildWatchMap(
    runtime.context.selectedUserIds,
    titles.map((item) => item.title),
  );
  const negativeInteractionMap = await buildNegativeInteractionMap(
    runtime.context.selectedUserIds,
    titles.map((item) => item.title),
  );

  const filtered = titles
    .filter((item) => {
      const negativeFlags =
        negativeInteractionMap.get(toTmdbKey(item.title.tmdbId, item.title.mediaType)) ??
        { hasHidden: false, hasDisliked: false };

      if (hasNegativeAssistantInteraction(negativeFlags)) {
        return false;
      }

      if (args.mediaType && item.title.mediaType !== args.mediaType) {
        return false;
      }

      if (
        typeof args.runtimeMax === "number" &&
        typeof item.title.runtimeMinutes === "number" &&
        item.title.runtimeMinutes > args.runtimeMax
      ) {
        return false;
      }

      if (args.onlyOnPreferredProviders) {
        const selectedAvailability = classifySelectedServiceAvailability(
          item.title,
          runtime.preferredProviders,
        );
        if (selectedAvailability !== "selected_services") {
          return false;
        }
      }

      if (args.provider && !providerMatches(item.title, args.provider)) {
        return false;
      }

      if (args.excludeWatched) {
        const watchedCount = watchMap.get(toTmdbKey(item.title.tmdbId, item.title.mediaType)) ?? 0;
        if (!runtime.context.isGroupMode && watchedCount > 0) {
          return false;
        }

        if (runtime.context.isGroupMode && watchedCount >= runtime.context.selectedUserIds.length) {
          return false;
        }
      }

      return true;
    })
    .map((item) => ({
      ...item,
      adjustedScore:
        item.score +
        moodAdjustment(item.title, args.mood) +
        referenceAdjustment(item.title, reference),
    }))
    .sort((left, right) => right.adjustedScore - left.adjustedScore);

  if (!executionContext || executionContext.recentlySuggestedKeys.size === 0) {
    return filtered;
  }

  const freshFirst = filtered.filter(
    (item) => !executionContext.recentlySuggestedKeys.has(buildAssistantTitleKey(item.title)),
  );

  return freshFirst.length > 0 ? freshFirst : filtered;
}

async function buildRecommendationCards(
  runtime: AssistantRuntimeContext,
  items: Array<{
    title: TitleSummary;
    score: number;
    explanations: RecommendationExplanation[];
    badges?: string[];
    source: AssistantCandidateSource;
    sourceLabel: string;
    personalSourceBadge?: string | null;
  }>,
  limit = DEFAULT_CARD_LIMIT,
): Promise<AssistantMessageCard[]> {
  return items.slice(0, limit).map((item) => ({
    id: crypto.randomUUID(),
    source: item.source,
    sourceLabel: item.sourceLabel,
    title: item.title,
    handoff: buildTitleHandoff(item.title, runtime.preferredProviders, env.tmdbWatchRegion),
    recommendationExplanations: item.explanations,
    recommendationBadges: item.badges ?? [],
    recommendationContextLabel: runtime.context.label,
    fitSummaryLabel: deriveCompactFitLabel({
      explanations: item.explanations,
      isGroupMode: runtime.context.isGroupMode,
      contextLabel: runtime.context.label,
    }),
    personalSourceBadge: item.personalSourceBadge ?? null,
  }));
}

async function buildCardsFromLibraryItems(
  runtime: AssistantRuntimeContext,
  items: LibrarySectionItem[],
  source: AssistantCandidateSource,
  sourceLabel: string,
  limit = DEFAULT_CARD_LIMIT,
): Promise<AssistantMessageCard[]> {
  const selectedItems = items.slice(0, limit);
  const sourceStates = await getInteractionSourceStateMap({
    userId: runtime.viewer.userId,
    titleCacheIds: selectedItems.map((item) => item.titleCacheId),
  });

  return Promise.all(
    selectedItems.map(async (item) => {
      const cachedTitle = await upsertTitleCache(item.title);
      const fitSummary = await getTitleFitSummary({
        userId: runtime.viewer.userId,
        householdId: runtime.viewer.householdId,
        title: item.title,
        titleCacheId: cachedTitle.id,
      });
      const sourceState = sourceStates.get(item.titleCacheId);
      const watchlistOrigin = sourceState
        ? getPersonalInteractionOriginLabel({
            interactionType: InteractionType.WATCHLIST,
            origin: sourceState.WATCHLIST ?? "manual",
          })
        : null;

      return {
        id: crypto.randomUUID(),
        source,
        sourceLabel,
        title: item.title,
        handoff: buildTitleHandoff(
          item.title,
          runtime.preferredProviders,
          env.tmdbWatchRegion,
        ),
        recommendationExplanations:
          item.explanations.length > 0
            ? item.explanations
            : buildFallbackExplanation(fitSummary.headline, fitSummary.detail),
        recommendationBadges: item.badges,
        recommendationContextLabel: runtime.context.label,
        fitSummaryLabel: fitSummary.bestForLabel ?? fitSummary.badge,
        personalSourceBadge:
          item.personalSourceBadge ??
          getLibrarySourceBadge({
            origin: sourceState?.WATCHLIST ?? null,
            sourceFilter: "all",
          }) ??
          watchlistOrigin,
      } satisfies AssistantMessageCard;
    }),
  );
}

async function getActiveContextToolPayload(
  runtime: AssistantRuntimeContext,
): Promise<ActiveContextToolPayload> {
  return {
    label: runtime.context.label,
    mode: runtime.context.mode,
    selectedUsers: runtime.activeNames,
    preferredProviders: runtime.preferredProviders,
    traktConnected: runtime.traktConnected,
    traktReviewHeadline: runtime.traktReview?.headline ?? null,
  };
}

async function getRecommendationToolPayload(
  runtime: AssistantRuntimeContext,
  rawArgs: AssistantRecommendationToolArgs,
  executionContext?: AssistantToolExecutionContext,
): Promise<RecommendationToolPayload> {
  const recommendations = await getRecommendedTitles({
    userIds: runtime.context.selectedUserIds,
    requestedById: runtime.viewer.userId,
    householdId: runtime.viewer.householdId,
  });

  const filtered = await applyTitleFilters(
    runtime,
    recommendations.items.map((item) => ({
      ...item,
      source: "recommendation" as const,
      sourceLabel: runtime.context.isGroupMode
        ? "Recommended for this group"
        : "Recommended for you",
      personalSourceBadge: null,
    })),
    rawArgs,
    executionContext,
  );

  const cards = await buildRecommendationCards(
    runtime,
    filtered,
    rawArgs.limit ?? DEFAULT_CARD_LIMIT,
  );

  return {
    cards,
    summary:
      cards.length > 0
        ? `Found ${cards.length} grounded recommendation option${cards.length === 1 ? "" : "s"} for ${runtime.context.label}.`
        : `No strong recommendation matches turned up for ${runtime.context.label} with those limits.`,
  };
}

async function getWatchlistToolPayload(
  runtime: AssistantRuntimeContext,
  rawArgs: AssistantWatchlistToolArgs,
  executionContext?: AssistantToolExecutionContext,
): Promise<RecommendationToolPayload> {
  const collection: LibraryCollection =
    rawArgs.scope === "shared_current"
      ? "shared_group"
      : rawArgs.scope === "shared_household"
        ? "shared_household"
        : "WATCHLIST";
  const workspace = await getLibraryWorkspace({
    userId: runtime.viewer.userId,
    householdId: runtime.viewer.householdId,
    collection,
    focus: rawArgs.onlyOnPreferredProviders ? "available" : "unwatched",
  });

  const section = workspace.sections.find((candidate) => candidate.items.length > 0);
  const items = section?.items ?? [];

  const filtered = await applyTitleFilters(
    runtime,
    items.map((item) => ({
      title: item.title,
      score: item.score,
      explanations: item.explanations,
      badges: item.badges,
      source:
        rawArgs.scope === "shared_current"
          ? ("shared_group" as const)
          : rawArgs.scope === "shared_household"
            ? ("shared_household" as const)
            : ("watchlist" as const),
      sourceLabel:
        rawArgs.scope === "shared_current"
          ? "Shared for this group"
          : rawArgs.scope === "shared_household"
            ? "Saved for the household"
            : "Saved already",
      personalSourceBadge: item.personalSourceBadge ?? null,
    })),
    rawArgs,
    executionContext,
  );

  const cards = await buildCardsFromLibraryItems(
    runtime,
    filtered.map((item) =>
      items.find(
        (candidate) =>
          candidate.title.tmdbId === item.title.tmdbId &&
          candidate.title.mediaType === item.title.mediaType,
      ),
    ).filter((item): item is LibrarySectionItem => Boolean(item)),
    rawArgs.scope === "shared_current"
      ? "shared_group"
      : rawArgs.scope === "shared_household"
        ? "shared_household"
        : "watchlist",
    rawArgs.scope === "shared_current"
      ? "Shared for this group"
      : rawArgs.scope === "shared_household"
        ? "Saved for the household"
        : "Saved already",
    rawArgs.limit ?? DEFAULT_CARD_LIMIT,
  );

  return {
    cards,
    summary:
      cards.length > 0
        ? `Pulled ${cards.length} saved option${cards.length === 1 ? "" : "s"} for ${runtime.context.label}.`
        : "There is not a strong saved option that matches those limits right now.",
  };
}

async function getLibraryToolPayload(
  runtime: AssistantRuntimeContext,
  rawArgs: AssistantLibraryToolArgs,
  executionContext?: AssistantToolExecutionContext,
): Promise<RecommendationToolPayload> {
  const workspace = await getLibraryWorkspace({
    userId: runtime.viewer.userId,
    householdId: runtime.viewer.householdId,
    collection: rawArgs.collection ?? "overview",
    focus: rawArgs.focus ?? (rawArgs.onlyOnPreferredProviders ? "available" : "all"),
    source: rawArgs.source ?? "all",
  });
  const items = workspace.sections.flatMap((section) => section.items);

  const filtered = await applyTitleFilters(
    runtime,
    items.map((item) => ({
      title: item.title,
      score: item.score,
      explanations: item.explanations,
      badges: item.badges,
      source: "library" as const,
      sourceLabel: "Library candidate",
      personalSourceBadge: item.personalSourceBadge ?? null,
    })),
    rawArgs,
    executionContext,
  );

  const cards = await buildCardsFromLibraryItems(
    runtime,
    filtered.map((item) =>
      items.find(
        (candidate) =>
          candidate.title.tmdbId === item.title.tmdbId &&
          candidate.title.mediaType === item.title.mediaType,
      ),
    ).filter((item): item is LibrarySectionItem => Boolean(item)),
    "library",
    "Library candidate",
    rawArgs.limit ?? DEFAULT_CARD_LIMIT,
  );

  return {
    cards,
    summary:
      cards.length > 0
        ? `Found ${cards.length} library option${cards.length === 1 ? "" : "s"} for ${runtime.context.label}.`
        : "The current library filters left ScreenLantern without a strong candidate.",
  };
}

async function getSearchToolPayload(
  runtime: AssistantRuntimeContext,
  rawArgs: AssistantSearchToolArgs,
): Promise<SearchToolPayload> {
  const results = await searchTitles({
    query: rawArgs.query,
    mediaType: rawArgs.mediaType ?? "all",
  });
  const hydrated = await hydrateProvidersForTitles(
    results.results.slice(0, rawArgs.limit ?? 3),
  );

  return {
    results: hydrated.map((title) => ({
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
      title: title.title,
      releaseYear: title.releaseYear,
      providers: title.providers.map((provider) => provider.name),
    })),
  };
}

async function getFitToolPayload(
  runtime: AssistantRuntimeContext,
  rawArgs: AssistantFitToolArgs,
): Promise<FitToolPayload> {
  const detail = await getTitleDetails(rawArgs.tmdbId, rawArgs.mediaType);
  if (!detail.data) {
    return {
      headline: "That title is not available right now.",
      detail: "ScreenLantern could not load enough title detail to explain the fit.",
      cards: [],
    };
  }

  const cachedTitle = await upsertTitleCache(detail.data);
  const fitSummary = await getTitleFitSummary({
    userId: runtime.viewer.userId,
    householdId: runtime.viewer.householdId,
    title: detail.data,
    titleCacheId: cachedTitle.id,
  });

  return {
    headline: fitSummary.headline,
    detail: fitSummary.detail,
    bestForLabel: fitSummary.bestForLabel ?? null,
    cards: [
      {
        id: crypto.randomUUID(),
        source: "search",
        sourceLabel: "Title fit",
        title: detail.data,
        handoff: buildTitleHandoff(detail.data, runtime.preferredProviders, env.tmdbWatchRegion),
        recommendationExplanations: buildFallbackExplanation(
          fitSummary.headline,
          fitSummary.detail,
        ),
        recommendationBadges: [],
        recommendationContextLabel: runtime.context.label,
        fitSummaryLabel: fitSummary.bestForLabel ?? fitSummary.badge,
        personalSourceBadge: null,
      },
    ],
  };
}

async function executeAssistantTool(
  runtime: AssistantRuntimeContext,
  executionContext: AssistantToolExecutionContext,
  toolName: string,
  rawArgs: unknown,
): Promise<AssistantToolPayload> {
  if (toolName === "get_active_context") {
    return getActiveContextToolPayload(runtime);
  }

  if (toolName === "get_recommended_titles") {
    return getRecommendationToolPayload(
      runtime,
      recommendationArgsSchema.parse(normalizeRecommendationLikeArgs(rawArgs)),
      executionContext,
    );
  }

  if (toolName === "search_titles") {
    return getSearchToolPayload(runtime, searchArgsSchema.parse(normalizeSearchArgs(rawArgs)));
  }

  if (toolName === "get_fit_summary") {
    return getFitToolPayload(runtime, fitArgsSchema.parse(normalizeFitArgs(rawArgs)));
  }

  if (toolName === "get_watchlist_candidates") {
    return getWatchlistToolPayload(
      runtime,
      watchlistArgsSchema.parse(normalizeRecommendationLikeArgs(rawArgs)),
      executionContext,
    );
  }

  if (toolName === "get_library_candidates") {
    return getLibraryToolPayload(
      runtime,
      libraryArgsSchema.parse(normalizeRecommendationLikeArgs(rawArgs)),
      executionContext,
    );
  }

  throw new Error(`Unknown assistant tool: ${toolName}`);
}

function getLatestCardsFromPayload(
  payload: AssistantToolPayload | { error: string },
): AssistantMessageCard[] {
  if ("cards" in payload && Array.isArray(payload.cards)) {
    return payload.cards;
  }

  return [];
}

function buildProviderNote(card: AssistantMessageCard) {
  if (!card.handoff?.primaryOption) {
    if (card.title.providers.length === 0) {
      return "Provider availability is currently unavailable.";
    }

    return `Available on ${card.title.providers[0]?.name}, but direct open is unavailable.`;
  }

  const actionLabel =
    card.handoff.primaryOption.handoffKind &&
    card.handoff.primaryOption.handoffUrl
      ? card.handoff.primaryOption.handoffKind === "title_direct"
        ? `Open in ${card.handoff.primaryOption.providerName}`
        : card.handoff.primaryOption.handoffKind === "provider_search"
          ? `Search in ${card.handoff.primaryOption.providerName}`
          : `Browse in ${card.handoff.primaryOption.providerName}`
      : null;

  return actionLabel
    ? `${actionLabel} when you are ready.`
    : card.title.providers.length > 0
      ? `Available on ${card.title.providers.map((provider) => provider.name).join(", ")}.`
      : "Provider availability is currently unavailable.";
}

function summarizeCards(
  runtime: AssistantRuntimeContext,
  cards: AssistantMessageCard[],
  sourceLabel?: string,
) {
  if (cards.length === 0) {
    return `I did not find a strong match for ${runtime.context.label} with those limits. Try loosening the runtime, provider, or saved-only constraints.`;
  }

  if (cards.length === 1) {
    const [card] = cards;
    return `${card.title.title} is the strongest ${sourceLabel ?? "pick"} for ${runtime.context.label}. ${card.recommendationExplanations[0]?.summary ?? "It lines up with the current profile."} ${buildProviderNote(card)}`;
  }

  const lead = cards[0];
  const backupTitles = cards.slice(1).map((card) => card.title.title).join(" and ");
  return `I would start with ${lead.title.title} for ${runtime.context.label}. ${lead.recommendationExplanations[0]?.summary ?? "It is the cleanest fit right now."} If you want backups, ${backupTitles} also fit the current ask.`;
}

function findMostRecentAssistantCards(messages: AssistantConversationMessage[]) {
  const reversed = [...messages].reverse();
  return reversed.find((message) => message.role === "assistant" && message.cards.length > 0)
    ?.cards ?? [];
}

function isOffTopicMessage(message: string) {
  const normalized = message.toLowerCase();
  const domainWords = [
    "watch",
    "movie",
    "show",
    "series",
    "funny",
    "comedy",
    "runtime",
    "services",
    "watchlist",
    "library",
    "recommend",
    "tonight",
    "lighter",
    "fit",
    "severance",
  ];

  return !domainWords.some((word) => normalized.includes(word));
}

function parseAssistantIntentMessage(args: {
  message: string;
  previousCards: AssistantMessageCard[];
}) {
  const normalized = args.message.toLowerCase();

  return {
    normalized,
    wantsWhyThis:
      normalized.includes("why") &&
      normalized.includes("this") &&
      args.previousCards.length > 0,
    wantsWatchlist:
      normalized.includes("watchlist") ||
      normalized.includes("saved already") ||
      normalized.includes("saved already") ||
      normalized.includes("what we saved") ||
      normalized.includes("our saved") ||
      normalized.includes("from our saves"),
    wantsLibrary: normalized.includes("library"),
    wantsSimilarity: normalized.includes("like "),
    wantsThree: normalized.includes("3") || normalized.includes("three"),
    wantsOnlyMovies:
      normalized.includes("only movie") || normalized.includes("only movies") || normalized.includes("not a show"),
    wantsOnlyShows:
      normalized.includes("only show") || normalized.includes("only shows") || normalized.includes("series only"),
    wantsOurServices:
      normalized.includes("our services") || normalized.includes("on our services"),
    wantsExcludeWatched:
      normalized.includes("haven't watched yet") || normalized.includes("not watched yet"),
    wantsFunny: normalized.includes("funny"),
    wantsLighter: normalized.includes("lighter"),
    wantsUnderTwoHours: normalized.includes("under 2 hours"),
    wantsUnderNinety: normalized.includes("under 90"),
    wantsSharedScope: normalized.includes("shared"),
  };
}

function buildHeuristicToolArgs(
  parsed: ReturnType<typeof parseAssistantIntentMessage>,
  previousCards: AssistantMessageCard[],
): AssistantRecommendationToolArgs {
  return {
    limit: parsed.wantsThree ? 3 : DEFAULT_CARD_LIMIT,
    mediaType: parsed.wantsOnlyMovies ? "movie" : parsed.wantsOnlyShows ? "tv" : null,
    runtimeMax: parsed.wantsUnderTwoHours
      ? 120
      : parsed.wantsUnderNinety
        ? 90
        : previousCards.length > 0 && parsed.wantsLighter
          ? Math.max(
              80,
              Math.round(
                previousCards.reduce(
                  (total, card) => total + (card.title.runtimeMinutes ?? 0),
                  0,
                ) / previousCards.length,
              ) - 20,
            )
          : null,
    onlyOnPreferredProviders: parsed.wantsOurServices,
    mood: parsed.wantsFunny ? "funny" : parsed.wantsLighter ? "lighter" : null,
    excludeWatched: parsed.wantsExcludeWatched,
  };
}

async function tryRunStructuredAssistantTurn(args: {
  runtime: AssistantRuntimeContext;
  history: AssistantConversationMessage[];
  message: string;
}): Promise<AssistantTurnResult> {
  const previousCards = findMostRecentAssistantCards(args.history);
  const parsed = parseAssistantIntentMessage({
    message: args.message,
    previousCards,
  });
  const toolExecutionContext: AssistantToolExecutionContext = {
    recentlySuggestedKeys: collectRecentlySuggestedKeys(args.history),
  };

  if (isOffTopicMessage(args.message) && previousCards.length === 0) {
    return {
      text: `I’m here to help with what to watch for ${args.runtime.context.label}. Ask for a recommendation, a refinement like “only movies” or “something lighter,” or a pick from your watchlist or library.`,
        cards: [],
      };
  }

  if (parsed.wantsWhyThis) {
    const lead = previousCards[0];
    const fitPayload = await getFitToolPayload(args.runtime, {
      tmdbId: lead.title.tmdbId,
      mediaType: lead.title.mediaType,
    });
    return {
      text: `${fitPayload.headline}. ${fitPayload.detail}`,
      cards: fitPayload.cards,
    };
  }

  if (parsed.wantsWatchlist) {
    const scope =
      parsed.wantsSharedScope || args.runtime.context.isGroupMode
        ? "shared_current"
        : "personal";
    const payload = await getWatchlistToolPayload(args.runtime, {
      scope,
      ...buildHeuristicToolArgs(parsed, previousCards),
    }, toolExecutionContext);

    return {
      text:
        payload.cards.length > 0
          ? summarizeCards(args.runtime, payload.cards, "saved pick")
          : args.runtime.context.isGroupMode
            ? `I did not find a strong pick from this group's saved titles right now. If you want, I can widen that to fresh recommendations on your services instead.`
            : "I did not find a strong pick from your saved titles right now. If you want, I can widen that to fresh recommendations instead.",
      cards: payload.cards,
    };
  }

  if (parsed.wantsLibrary) {
    const payload = await getLibraryToolPayload(args.runtime, {
      collection: "overview",
      focus: parsed.wantsOurServices || parsed.normalized.includes("available") ? "available" : "all",
      ...buildHeuristicToolArgs(parsed, previousCards),
    }, toolExecutionContext);

    return {
      text: summarizeCards(args.runtime, payload.cards, "library pick"),
      cards: payload.cards,
    };
  }

  if (parsed.wantsSimilarity) {
    const referenceQuery = args.message.split(/like/i)[1]?.trim() ?? "";
    const search = await getSearchToolPayload(args.runtime, {
      query: referenceQuery,
      limit: 1,
    });
    const reference = search.results[0];
    const payload = await getRecommendationToolPayload(args.runtime, {
      ...buildHeuristicToolArgs(parsed, previousCards),
      referenceTmdbId: reference?.tmdbId ?? null,
      referenceMediaType: reference?.mediaType ?? null,
    }, toolExecutionContext);

    return {
      text: summarizeCards(args.runtime, payload.cards, "similar pick"),
      cards: payload.cards,
    };
  }

  return {
    text: "",
    cards: [],
  };
}

async function runMockAssistantTurn(args: {
  runtime: AssistantRuntimeContext;
  history: AssistantConversationMessage[];
  message: string;
}): Promise<AssistantTurnResult> {
  const previousCards = findMostRecentAssistantCards(args.history);
  const toolExecutionContext: AssistantToolExecutionContext = {
    recentlySuggestedKeys: collectRecentlySuggestedKeys(args.history),
  };
  const parsed = parseAssistantIntentMessage({
    message: args.message,
    previousCards,
  });
  const structuredTurn = await tryRunStructuredAssistantTurn(args);

  if (structuredTurn.text) {
    return structuredTurn;
  }

  const payload = await getRecommendationToolPayload(args.runtime, {
    ...buildHeuristicToolArgs(parsed, previousCards),
  }, toolExecutionContext);

  return {
    text: summarizeCards(args.runtime, payload.cards, "pick"),
    cards: payload.cards,
  };
}

function buildOpenAiSystemPrompt(runtime: AssistantRuntimeContext, lastContext: AssistantContextSnapshot | null) {
  const contextShifted =
    lastContext &&
    (lastContext.mode !== runtime.context.mode ||
      lastContext.selectedUserIds.join("|") !== runtime.context.selectedUserIds.join("|"));

  return [
    "You are the ScreenLantern recommendation assistant.",
    "Stay inside ScreenLantern's domain: what to watch, why it fits, saved titles, services, and practical next-step handoff.",
    "Do not answer unrelated general questions beyond briefly redirecting back to watch recommendations.",
    "Always prefer tool calls over guessing. Never invent title availability, household data, provider behavior, or watched history.",
    "Current active recommendation context is authoritative for this turn.",
    `Current context label: ${runtime.context.label}.`,
    `Current mode: ${runtime.context.mode}.`,
    `Preferred providers: ${runtime.preferredProviders.join(", ") || "none selected"}.`,
    `Trakt connected: ${runtime.traktConnected ? "yes" : "no"}.`,
    contextShifted
      ? "The active context changed since the earlier conversation. Treat the new context as authoritative and do not assume earlier solo/group scope still applies."
      : null,
    "Keep responses concise and useful.",
    "When recommending, give a short grounded why-this reason.",
    "If providers are limited or only search-level handoff exists, say so simply.",
    "If recommending for a group, do not claim perfect unanimity. Use compromise-oriented language when appropriate.",
  ]
    .filter(Boolean)
    .join("\n");
}

function conversationToOpenAiMessages(
  history: AssistantConversationMessage[],
  newUserMessage: string,
  systemPrompt: string,
): AssistantOpenAiMessage[] {
  return [
    {
      role: "system",
      content: systemPrompt,
    },
    ...history.map((message) => ({
      role: message.role,
      content: message.text,
    })),
    {
      role: "user",
      content: newUserMessage,
    },
  ];
}

function getOpenAiTools() {
  return [
    {
      type: "function",
      function: {
        name: "get_active_context",
        description:
          "Get the current solo or group recommendation context, selected providers, and Trakt freshness summary.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_recommended_titles",
        description:
          "Get grounded recommendation options for the current active context. Use this for broad recommendation asks and most refinements.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer" },
            mediaType: { type: ["string", "null"], enum: ["movie", "tv", null] },
            runtimeMax: { type: ["integer", "null"] },
            onlyOnPreferredProviders: { type: ["boolean", "null"] },
            provider: { type: ["string", "null"] },
            mood: {
              type: ["string", "null"],
              enum: ["funny", "lighter", "tense", "romantic", "scary", "thoughtful", null],
            },
            referenceTmdbId: { type: ["integer", "null"] },
            referenceMediaType: { type: ["string", "null"], enum: ["movie", "tv", null] },
            excludeWatched: { type: ["boolean", "null"] },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_watchlist_candidates",
        description:
          "Get suggestions from saved titles. Use shared_current for the current group and personal for a solo watchlist pick.",
        parameters: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              enum: ["personal", "shared_current", "shared_household"],
            },
            limit: { type: "integer" },
            mediaType: { type: ["string", "null"], enum: ["movie", "tv", null] },
            runtimeMax: { type: ["integer", "null"] },
            onlyOnPreferredProviders: { type: ["boolean", "null"] },
            provider: { type: ["string", "null"] },
            mood: {
              type: ["string", "null"],
              enum: ["funny", "lighter", "tense", "romantic", "scary", "thoughtful", null],
            },
            referenceTmdbId: { type: ["integer", "null"] },
            referenceMediaType: { type: ["string", "null"], enum: ["movie", "tv", null] },
            excludeWatched: { type: ["boolean", "null"] },
          },
          required: ["scope"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_library_candidates",
        description:
          "Get options from the current library workspace when the user wants something from saved/imported/library surfaces.",
        parameters: {
          type: "object",
          properties: {
            collection: {
              type: ["string", "null"],
              enum: [
                "overview",
                "WATCHLIST",
                "WATCHED",
                "LIKE",
                "DISLIKE",
                "HIDE",
                "shared_group",
                "shared_household",
                null,
              ],
            },
            focus: {
              type: ["string", "null"],
              enum: ["all", "available", "movies", "shows", "unwatched", null],
            },
            source: {
              type: ["string", "null"],
              enum: ["all", "imported", "manual", null],
            },
            limit: { type: "integer" },
            mediaType: { type: ["string", "null"], enum: ["movie", "tv", null] },
            runtimeMax: { type: ["integer", "null"] },
            onlyOnPreferredProviders: { type: ["boolean", "null"] },
            provider: { type: ["string", "null"] },
            mood: {
              type: ["string", "null"],
              enum: ["funny", "lighter", "tense", "romantic", "scary", "thoughtful", null],
            },
            referenceTmdbId: { type: ["integer", "null"] },
            referenceMediaType: { type: ["string", "null"], enum: ["movie", "tv", null] },
            excludeWatched: { type: ["boolean", "null"] },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_titles",
        description:
          "Search titles by name. Use this before similarity or fit questions when you need to resolve a reference title.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            mediaType: { type: ["string", "null"], enum: ["movie", "tv", null] },
            limit: { type: "integer" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_fit_summary",
        description:
          "Explain why a specific title fits the current active context, including group-safe fit language.",
        parameters: {
          type: "object",
          properties: {
            tmdbId: { type: "integer" },
            mediaType: { type: "string", enum: ["movie", "tv"] },
          },
          required: ["tmdbId", "mediaType"],
        },
      },
    },
  ] as const;
}

async function callOpenAi(messages: AssistantOpenAiMessage[]) {
  const runtimeConfig = resolveAssistantRuntimeConfig(env);
  let response: Response;

  try {
    response = await fetch(`${runtimeConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: runtimeConfig.model,
        temperature: 0.3,
        messages,
        tools: getOpenAiTools(),
      }),
    });
  } catch (error) {
    if (runtimeConfig.provider === "ollama") {
      const dockerHint =
        runtimeConfig.baseUrl.includes("localhost") ||
        runtimeConfig.baseUrl.includes("127.0.0.1")
          ? " If ScreenLantern is running in Docker, use http://host.docker.internal:11434/v1 instead of localhost."
          : "";

      throw new Error(
        `Unable to reach Ollama at ${runtimeConfig.baseUrl}.${dockerHint} Make sure Ollama is running and the selected model is available locally.`,
      );
    }

    throw new Error(
      `Unable to reach ${runtimeConfig.providerLabel} at ${runtimeConfig.baseUrl}. Check your API key, base URL, and local network access.`,
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${runtimeConfig.providerLabel} request failed: ${errorText}`);
  }

  return (await response.json()) as {
    choices?: Array<{
      message?: AssistantOpenAiMessage;
    }>;
  };
}

async function runOpenAiAssistantTurn(args: {
  runtime: AssistantRuntimeContext;
  history: AssistantConversationMessage[];
  message: string;
  lastContext: AssistantContextSnapshot | null;
}): Promise<AssistantTurnResult> {
  const structuredTurn = await tryRunStructuredAssistantTurn(args);

  if (structuredTurn.text) {
    return structuredTurn;
  }

  let messages = conversationToOpenAiMessages(
    args.history,
    args.message,
    buildOpenAiSystemPrompt(args.runtime, args.lastContext),
  );
  let latestCards: AssistantMessageCard[] = [];
  const toolExecutionContext: AssistantToolExecutionContext = {
    recentlySuggestedKeys: collectRecentlySuggestedKeys(args.history),
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await callOpenAi(messages);
    const assistantMessage = completion.choices?.[0]?.message;

    if (!assistantMessage) {
      break;
    }

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return {
        text:
          assistantMessage.content?.trim() ||
          summarizeCards(args.runtime, latestCards, "pick"),
        cards: latestCards,
      };
    }

    messages = [...messages, assistantMessage];

    for (const toolCall of assistantMessage.tool_calls) {
      let result: AssistantToolPayload | { error: string };

      try {
        const rawArguments = toolCall.function.arguments
          ? JSON.parse(toolCall.function.arguments)
          : {};
        result = await executeAssistantTool(
          args.runtime,
          toolExecutionContext,
          toolCall.function.name,
          rawArguments,
        );
      } catch (error) {
        result = {
          error:
            error instanceof Error
              ? error.message
              : "Tool call failed. Try a simpler recommendation ask.",
        };
      }

      const cards = getLatestCardsFromPayload(result);
      if (cards.length > 0) {
        latestCards = cards;
      }

      messages = [
        ...messages,
        {
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(result),
        },
      ];
    }
  }

  return {
    text:
      latestCards.length > 0
        ? summarizeCards(args.runtime, latestCards, "pick")
        : "I could not finish that recommendation cleanly. Try a simpler ask like “only movies on our services” or “what from our watchlist fits tonight?”",
    cards: latestCards,
  };
}

async function loadStoredConversation(viewer: AssistantViewer) {
  const record = await prisma.aiConversation.findUnique({
    where: {
      userId: viewer.userId,
    },
    select: {
      messagesJson: true,
      lastContextJson: true,
    },
  });

  return {
    messages: parseStoredMessages(record?.messagesJson),
    lastContext: parseStoredContext(record?.lastContextJson),
  };
}

export async function getAssistantConversationSnapshot(args: {
  viewer: AssistantViewer;
}): Promise<AssistantConversationSnapshot> {
  const runtime = await buildRuntimeContext(args.viewer);
  const stored = await loadStoredConversation(args.viewer);
  const assistantRuntime = resolveAssistantRuntimeConfig(env);

  return {
    isMockMode: assistantRuntime.isMockMode,
    runtimeMode: assistantRuntime.runtimeMode,
    providerLabel: assistantRuntime.providerLabel,
    context: runtime.context,
    messages: stored.messages,
  };
}

export async function clearAssistantConversation(args: {
  viewer: AssistantViewer;
}): Promise<AssistantConversationSnapshot> {
  await prisma.aiConversation.deleteMany({
    where: {
      userId: args.viewer.userId,
      householdId: args.viewer.householdId,
    },
  });

  return getAssistantConversationSnapshot(args);
}

export async function sendAssistantMessage(args: {
  viewer: AssistantViewer;
  message: string;
}): Promise<AssistantConversationSnapshot> {
  const runtime = await buildRuntimeContext(args.viewer);
  const stored = await loadStoredConversation(args.viewer);
  const assistantRuntime = resolveAssistantRuntimeConfig(env);
  const baseMessages = trimMessages(stored.messages);
  const userMessage = createMessage("user", args.message);
  const historyForModel = baseMessages;

  const turn = assistantRuntime.isMockMode
    ? await runMockAssistantTurn({
        runtime,
        history: historyForModel,
        message: args.message,
      })
    : await runOpenAiAssistantTurn({
        runtime,
        history: historyForModel,
        message: args.message,
        lastContext: stored.lastContext,
      });

  const assistantMessage = createMessage("assistant", turn.text, turn.cards);
  const messages = trimMessages([...baseMessages, userMessage, assistantMessage]);

  await persistConversation({
    viewer: args.viewer,
    messages,
    context: runtime.context,
  });

  return {
    isMockMode: assistantRuntime.isMockMode,
    runtimeMode: assistantRuntime.runtimeMode,
    providerLabel: assistantRuntime.providerLabel,
    context: runtime.context,
    messages,
  };
}
