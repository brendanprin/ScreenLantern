import { InteractionType } from "@prisma/client";

import { hydrateProvidersForTitles } from "@/lib/services/catalog";
import { getGroupWatchStateMap } from "@/lib/services/group-watch-sessions";
import { getInteractionMap } from "@/lib/services/interactions";
import { prisma } from "@/lib/prisma";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";
import {
  classifySelectedServiceAvailability,
  getWatchlistResurfacingSnapshot,
  type SelectedServiceAvailability,
  type WatchlistResurfacingCandidate,
} from "@/lib/services/recommendations";
import {
  getCurrentSharedWatchlistStateMap,
  getSharedWatchlistCollectionItems,
} from "@/lib/services/shared-watchlist";
import { mapTitleCacheToSummary, toTmdbKey } from "@/lib/services/title-cache";
import type {
  GroupWatchState,
  RecommendationExplanation,
  RecommendationModeKey,
  SharedWatchlistTitleState,
  TitleSummary,
} from "@/lib/types";

export const LIBRARY_FOCUS_OPTIONS = [
  "all",
  "available",
  "movies",
  "shows",
  "unwatched",
] as const;
export type LibraryFocus = (typeof LIBRARY_FOCUS_OPTIONS)[number];

export const LIBRARY_SORT_OPTIONS = ["smart", "recent", "runtime"] as const;
export type LibrarySort = (typeof LIBRARY_SORT_OPTIONS)[number];

export const LIBRARY_COLLECTION_OPTIONS = [
  "overview",
  InteractionType.WATCHLIST,
  InteractionType.WATCHED,
  InteractionType.LIKE,
  InteractionType.DISLIKE,
  InteractionType.HIDE,
  "shared_group",
  "shared_household",
] as const;
export type LibraryCollection = (typeof LIBRARY_COLLECTION_OPTIONS)[number];

type ActionMode =
  | "solo_full"
  | "group_watch"
  | "shared_only"
  | "shared_group"
  | "none";
type LibraryInteractionKind = "watchlist" | "watched" | "liked" | "deprioritized";

export interface LibrarySectionItem {
  tmdbKey: string;
  titleCacheId: string;
  title: TitleSummary;
  activeTypes: InteractionType[];
  activeGroupWatch?: GroupWatchState;
  sharedWatchlistState?: SharedWatchlistTitleState;
  explanations: RecommendationExplanation[];
  badges: string[];
  availabilityMatch: SelectedServiceAvailability;
  updatedAt: string;
  score: number;
  isWatched: boolean;
}

export interface LibrarySection {
  id: string;
  title: string;
  description: string;
  emptyMessage: string;
  items: LibrarySectionItem[];
  actionMode: ActionMode;
  showGroupSaveAction?: boolean;
  showHouseholdSaveAction?: boolean;
}

export interface LibraryWorkspace {
  contextLabel: string;
  mode: RecommendationModeKey;
  isGroupMode: boolean;
  actingUserId: string | null;
  focus: LibraryFocus;
  sort: LibrarySort;
  collection: LibraryCollection;
  sections: LibrarySection[];
}

function buildContextLabel(activeNames: string[], isGroupMode: boolean) {
  if (isGroupMode) {
    return activeNames.join(" + ") || "this group";
  }

  return activeNames[0] ?? "you";
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function buildCollectionExplanations(args: {
  kind: LibraryInteractionKind;
  names: string[];
  interactionTypes: InteractionType[];
  isGroupMode: boolean;
  contextLabel: string;
}) {
  if (args.kind === "watched") {
    return buildWatchedExplanations({
      isGroupMode: false,
      contextLabel: args.contextLabel,
    });
  }

  if (args.kind === "watchlist") {
    return [
      {
        category: "watchlist_resurface" as const,
        summary: args.isGroupMode
          ? `Saved by ${formatList(args.names)} for ${args.contextLabel}`
          : "Saved to this watchlist",
        detail: args.isGroupMode
          ? "This title is in the active group's orbit because at least one selected member saved it."
          : "This title is still sitting in the current watchlist and ready for triage.",
      },
    ];
  }

  if (args.kind === "liked") {
    return [
      {
        category: "watch_history" as const,
        summary: args.isGroupMode
          ? `Liked by ${formatList(args.names)}`
          : "You liked this before",
        detail: args.isGroupMode
          ? "This is positive signal inside the active group, even if it is not a guaranteed shared pick."
          : "Liked titles stay visible here as strong positive taste references.",
      },
    ];
  }

  return buildDeprioritizedExplanations({
    names: args.names,
    interactionTypes: args.interactionTypes,
    isGroupMode: args.isGroupMode,
  });
}

function buildSharedCollectionExplanations(args: {
  scope: "GROUP" | "HOUSEHOLD";
  contextLabel: string;
  savedByNames: string[];
}) {
  const savedByLabel = formatList(args.savedByNames);

  return [
    {
      category: "watchlist_resurface" as const,
      summary:
        args.scope === "GROUP"
          ? `Saved for ${args.contextLabel}`
          : savedByLabel
            ? `Saved by ${savedByLabel} for the household`
            : "Saved for the household",
      detail:
        args.scope === "GROUP"
          ? savedByLabel
            ? `${savedByLabel} added this to the shared watchlist for ${args.contextLabel}.`
            : "This title is on the shared watchlist for the active group."
          : savedByLabel
            ? `${savedByLabel} added this to the household shared watchlist.`
            : "This title is on the household shared watchlist.",
    },
  ];
}

function buildProviderBadges(
  availabilityMatch: SelectedServiceAvailability,
  existingBadges: string[] = [],
) {
  const badges = [...existingBadges];

  if (availabilityMatch === "selected_services") {
    if (!badges.includes("Available now")) {
      badges.unshift("Available now");
    }
  } else if (availabilityMatch === "other_services") {
    badges.push("Available elsewhere");
  } else if (availabilityMatch === "unknown") {
    badges.push("Provider status unknown");
  }

  return [...new Set(badges)];
}

function applyFocusAndSort<T extends LibrarySectionItem>(
  items: T[],
  focus: LibraryFocus,
  sort: LibrarySort,
) {
  const filtered = items.filter((item) => {
    if (focus === "available") {
      return item.availabilityMatch === "selected_services";
    }

    if (focus === "movies") {
      return item.title.mediaType === "movie";
    }

    if (focus === "shows") {
      return item.title.mediaType === "tv";
    }

    if (focus === "unwatched") {
      return !item.isWatched;
    }

    return true;
  });

  return filtered.sort((left, right) => {
    if (sort === "recent") {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

    if (sort === "runtime") {
      const leftRuntime = left.title.runtimeMinutes ?? Number.POSITIVE_INFINITY;
      const rightRuntime = right.title.runtimeMinutes ?? Number.POSITIVE_INFINITY;

      if (leftRuntime !== rightRuntime) {
        return leftRuntime - rightRuntime;
      }
    }

    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function buildRecentlySavedExplanations(args: {
  candidate: WatchlistResurfacingCandidate;
  contextLabel: string;
  isGroupMode: boolean;
}) {
  const explanations: RecommendationExplanation[] = [
    {
      category: "watchlist_resurface",
      summary: args.isGroupMode
        ? `Saved recently around ${args.contextLabel}`
        : "Saved recently to this watchlist",
      detail: args.isGroupMode
        ? "This is still a fresh shared save for the active group context."
        : "It landed in this watchlist recently, so it has not gone stale yet.",
    },
  ];

  args.candidate.item.explanations.forEach((explanation) => {
    if (
      explanations.length < 3 &&
      !explanations.some((item) => item.category === explanation.category)
    ) {
      explanations.push(explanation);
    }
  });

  return explanations;
}

function buildWatchedExplanations(args: {
  isGroupMode: boolean;
  contextLabel: string;
}): RecommendationExplanation[] {
  return [
    {
      category: args.isGroupMode ? "group_watch_history" : "watch_history",
      summary: args.isGroupMode
        ? `${args.contextLabel} watched this together`
        : "You watched this before",
      detail: args.isGroupMode
        ? "ScreenLantern keeps shared watch history visible so repeat group picks are intentional."
        : "It stays in your library history so rewatches and taste signals remain visible.",
    },
  ];
}

function buildDeprioritizedExplanations(args: {
  names: string[];
  interactionTypes: InteractionType[];
  isGroupMode: boolean;
}): RecommendationExplanation[] {
  const hasHidden = args.interactionTypes.includes(InteractionType.HIDE);

  if (args.isGroupMode) {
    return [
      {
        category: "watch_history",
        summary: hasHidden
          ? `At least one selected member hid this`
          : `At least one selected member disliked this`,
        detail:
          "ScreenLantern keeps these lower in the decision stack so the room does not keep circling back to them.",
      },
    ];
  }

  return [
    {
      category: "watch_history",
      summary: hasHidden ? "You hid this before" : "You disliked this before",
      detail: hasHidden
        ? "Hidden titles stay available for cleanup, but ScreenLantern treats them as out of rotation."
        : "Disliked titles stay visible here so you can revisit or clean them up intentionally.",
    },
  ];
}

async function hydrateGroupedTitles<T extends { title: TitleSummary }>(items: T[]) {
  const hydrated = await hydrateProvidersForTitles(
    items.map((item) => item.title),
    {
      refreshStale: true,
    },
  );
  const byKey = new Map(
    hydrated.map((title) => [toTmdbKey(title.tmdbId, title.mediaType), title]),
  );

  return items.map((item) => ({
    ...item,
    title: byKey.get(toTmdbKey(item.title.tmdbId, item.title.mediaType)) ?? item.title,
  }));
}

async function buildSharedCollectionItems(args: {
  items: Awaited<ReturnType<typeof getSharedWatchlistCollectionItems>>["items"];
  preferredProviders: string[];
  contextLabel: string;
}) {
  const hydrated = await hydrateGroupedTitles(
    args.items.map((entry) => ({
      ...entry,
      updatedAt: new Date(entry.updatedAt),
    })),
  );

  return hydrated.map<LibrarySectionItem>((entry) => {
    const availabilityMatch = classifySelectedServiceAvailability(
      entry.title,
      args.preferredProviders,
    );

    return {
      tmdbKey: toTmdbKey(entry.title.tmdbId, entry.title.mediaType),
      titleCacheId: entry.titleCacheId,
      title: entry.title,
      activeTypes: [],
      explanations: buildSharedCollectionExplanations({
        scope: entry.scope,
        contextLabel: entry.contextLabel || args.contextLabel,
        savedByNames: entry.savedByNames,
      }),
      badges: buildProviderBadges(availabilityMatch),
      availabilityMatch,
      updatedAt: entry.updatedAt.toISOString(),
      score: new Date(entry.updatedAt).getTime(),
      isWatched: false,
    };
  });
}

async function buildWatchlistSections(args: {
  userIds: string[];
  householdId: string;
  contextLabel: string;
  isGroupMode: boolean;
  focus: LibraryFocus;
  sort: LibrarySort;
}) {
  const snapshot = await getWatchlistResurfacingSnapshot({
    userIds: args.userIds,
    householdId: args.householdId,
    maxPerLane: 12,
  });
  const usedKeys = new Set<string>();
  const availableItems = applyFocusAndSort(
    snapshot.candidates
      .filter((candidate) => candidate.availabilityMatch === "selected_services")
      .map<LibrarySectionItem>((candidate) => ({
        tmdbKey: toTmdbKey(candidate.item.title.tmdbId, candidate.item.title.mediaType),
        titleCacheId: candidate.titleCacheId,
        title: candidate.item.title,
        activeTypes: [],
        explanations: candidate.item.explanations,
        badges: buildProviderBadges(candidate.availabilityMatch, candidate.item.badges),
        availabilityMatch: candidate.availabilityMatch,
        updatedAt: candidate.latestUpdatedAt,
        score: candidate.item.score,
        isWatched: false,
      })),
    args.focus,
    args.sort,
  ).slice(0, 6);

  availableItems.forEach((item) => usedKeys.add(item.tmdbKey));

  const bestItems = applyFocusAndSort(
    snapshot.candidates
      .filter((candidate) => !usedKeys.has(toTmdbKey(candidate.item.title.tmdbId, candidate.item.title.mediaType)))
      .map<LibrarySectionItem>((candidate) => ({
        tmdbKey: toTmdbKey(candidate.item.title.tmdbId, candidate.item.title.mediaType),
        titleCacheId: candidate.titleCacheId,
        title: candidate.item.title,
        activeTypes: [],
        explanations: candidate.item.explanations,
        badges: buildProviderBadges(candidate.availabilityMatch, candidate.item.badges),
        availabilityMatch: candidate.availabilityMatch,
        updatedAt: candidate.latestUpdatedAt,
        score: candidate.item.score,
        isWatched: false,
      })),
    args.focus,
    args.sort,
  ).slice(0, 6);

  bestItems.forEach((item) => usedKeys.add(item.tmdbKey));

  const recentItems = applyFocusAndSort(
    snapshot.candidates
      .filter((candidate) => !usedKeys.has(toTmdbKey(candidate.item.title.tmdbId, candidate.item.title.mediaType)))
      .map<LibrarySectionItem>((candidate) => ({
        tmdbKey: toTmdbKey(candidate.item.title.tmdbId, candidate.item.title.mediaType),
        titleCacheId: candidate.titleCacheId,
        title: candidate.item.title,
        activeTypes: [],
        explanations: buildRecentlySavedExplanations({
          candidate,
          contextLabel: args.contextLabel,
          isGroupMode: args.isGroupMode,
        }),
        badges: buildProviderBadges(candidate.availabilityMatch, candidate.item.badges),
        availabilityMatch: candidate.availabilityMatch,
        updatedAt: candidate.latestUpdatedAt,
        score: candidate.item.score,
        isWatched: false,
      })),
    args.focus,
    "recent",
  ).slice(0, 6);

  return {
    mode: snapshot.mode,
    activeNames: snapshot.activeNames,
    profile: snapshot.profile,
    sections: [
      {
        id: "available_now",
        title: args.isGroupMode ? "Available now for this group" : "Available now",
        description: args.isGroupMode
          ? "Personal and shared saves this active group can actually start on the services already in play."
          : "Saved titles that are ready to start on this profile's selected services.",
        emptyMessage: args.isGroupMode
          ? "Nothing from this group's personal or shared saves is available on the selected services right now."
          : "Nothing from this watchlist is available on the selected services right now.",
        items: availableItems,
        actionMode: args.isGroupMode ? ("group_watch" as const) : ("solo_full" as const),
        showGroupSaveAction: args.isGroupMode,
        showHouseholdSaveAction: true,
      },
      {
        id: "best_fit",
        title: args.isGroupMode ? "Good for this group" : "Best from your watchlist",
        description: args.isGroupMode
          ? "Shared and personal saves that still fit this exact room and have not been watched together yet."
          : "Saved titles with the strongest current fit across taste, runtime, and service practicality.",
        emptyMessage: args.isGroupMode
          ? "No fresh shared candidates matched this group's current filters."
          : "No watchlist titles matched this profile's current filters.",
        items: bestItems,
        actionMode: args.isGroupMode ? ("group_watch" as const) : ("solo_full" as const),
        showGroupSaveAction: args.isGroupMode,
        showHouseholdSaveAction: true,
      },
      {
        id: "recently_saved",
        title: "Recently saved",
        description: args.isGroupMode
          ? "Fresh personal and shared saves that are still in play for tonight."
          : "Fresh saves that have not fallen out of rotation yet.",
        emptyMessage: args.isGroupMode
          ? "No recent group-relevant saves matched this view."
          : "No recent saves matched this view.",
        items: recentItems,
        actionMode: args.isGroupMode ? ("group_watch" as const) : ("solo_full" as const),
        showGroupSaveAction: args.isGroupMode,
        showHouseholdSaveAction: true,
      },
    ],
  };
}

async function buildGroupedInteractionItems(args: {
  userIds: string[];
  householdId: string;
  interactionTypes: InteractionType[];
  preferredProviders: string[];
  isGroupMode: boolean;
  contextLabel: string;
  kind: LibraryInteractionKind;
}) {
  const interactions = await prisma.userTitleInteraction.findMany({
    where: {
      userId: {
        in: args.userIds,
      },
      interactionType: {
        in: args.interactionTypes,
      },
      user: {
        householdId: args.householdId,
      },
    },
    include: {
      title: true,
      user: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 40,
  });

  const grouped = new Map<
    string,
    {
      titleCacheId: string;
      title: TitleSummary;
      names: Set<string>;
      interactionTypes: Set<InteractionType>;
      updatedAt: Date;
    }
  >();

  interactions.forEach((interaction) => {
    const title = mapTitleCacheToSummary(interaction.title as never);
    const key = toTmdbKey(title.tmdbId, title.mediaType);
    const existing = grouped.get(key);

    if (existing) {
      existing.names.add(interaction.user.name);
      existing.interactionTypes.add(interaction.interactionType);
      if (interaction.updatedAt > existing.updatedAt) {
        existing.updatedAt = interaction.updatedAt;
      }
      return;
    }

    grouped.set(key, {
      titleCacheId: interaction.title.id,
      title,
      names: new Set([interaction.user.name]),
      interactionTypes: new Set([interaction.interactionType]),
      updatedAt: interaction.updatedAt,
    });
  });

  const hydrated = await hydrateGroupedTitles(
    [...grouped.values()].map((entry) => ({
      ...entry,
    })),
  );

  return hydrated.map<LibrarySectionItem>((entry) => {
    const availabilityMatch = classifySelectedServiceAvailability(
      entry.title,
      args.preferredProviders,
    );

    return {
      tmdbKey: toTmdbKey(entry.title.tmdbId, entry.title.mediaType),
      titleCacheId: entry.titleCacheId,
      title: entry.title,
      activeTypes: [...entry.interactionTypes],
      explanations: buildCollectionExplanations({
        kind: args.kind,
        names: [...entry.names],
        interactionTypes: [...entry.interactionTypes],
        isGroupMode: args.isGroupMode,
        contextLabel: args.contextLabel,
      }),
      badges: buildProviderBadges(availabilityMatch),
      availabilityMatch,
      updatedAt: entry.updatedAt.toISOString(),
      score: entry.updatedAt.getTime(),
      isWatched: args.interactionTypes.includes(InteractionType.WATCHED),
    };
  });
}

async function buildGroupWatchedItems(args: {
  userIds: string[];
  householdId: string;
  preferredProviders: string[];
  contextLabel: string;
}) {
  const sessions = await prisma.groupWatchSession.findMany({
    where: {
      householdId: args.householdId,
      participantKey: [...new Set(args.userIds)].sort((left, right) => left.localeCompare(right)).join("|"),
    },
    include: {
      title: true,
    },
    orderBy: {
      watchedAt: "desc",
    },
    take: 24,
  });

  const hydrated = await hydrateGroupedTitles(
    sessions.map((session) => ({
      titleCacheId: session.title.id,
      title: mapTitleCacheToSummary(session.title as never),
      updatedAt: session.watchedAt,
    })),
  );

  return hydrated.map<LibrarySectionItem>((entry) => {
    const availabilityMatch = classifySelectedServiceAvailability(
      entry.title,
      args.preferredProviders,
    );

    return {
      tmdbKey: toTmdbKey(entry.title.tmdbId, entry.title.mediaType),
      titleCacheId: entry.titleCacheId,
      title: entry.title,
      activeTypes: [],
      explanations: buildWatchedExplanations({
        isGroupMode: true,
        contextLabel: args.contextLabel,
      }),
      badges: buildProviderBadges(availabilityMatch),
      availabilityMatch,
      updatedAt: entry.updatedAt.toISOString(),
      score: entry.updatedAt.getTime(),
      isWatched: true,
    };
  });
}

async function buildCollectionSection(args: {
  collection: LibraryCollection;
  userIds: string[];
  viewerUserId: string;
  actingUserId: string | null;
  householdId: string;
  preferredProviders: string[];
  contextLabel: string;
  isGroupMode: boolean;
  focus: LibraryFocus;
  sort: LibrarySort;
}) {
  if (args.collection === "overview") {
    return null;
  }

  let items: LibrarySectionItem[] = [];
  let actionMode: ActionMode = args.isGroupMode ? "none" : "solo_full";
  let title = "Collection";
  let description = args.isGroupMode
    ? "This collection view respects the active group context where that distinction exists."
    : "This collection view follows the active solo profile instead of the signed-in account.";
  let showGroupSaveAction = false;
  let showHouseholdSaveAction = false;

  if (args.collection === "shared_group") {
    const shared = await getSharedWatchlistCollectionItems({
      userId: args.viewerUserId,
      actorUserId: args.actingUserId ?? undefined,
      householdId: args.householdId,
      scope: "GROUP",
    });

    items = await buildSharedCollectionItems({
      items: shared.items,
      preferredProviders: args.preferredProviders,
      contextLabel: shared.contextLabel ?? args.contextLabel,
    });
    actionMode = args.isGroupMode ? "shared_group" : "none";
    title = args.isGroupMode
      ? `Collection: Shared for ${shared.contextLabel ?? args.contextLabel}`
      : "Collection: Shared for this group";
    description = args.isGroupMode
      ? "Titles intentionally saved for this exact active group."
      : "Switch to a group context to work with group-shared watchlist entries.";
    showGroupSaveAction = args.isGroupMode;
    showHouseholdSaveAction = args.isGroupMode;
  } else if (args.collection === "shared_household") {
    const shared = await getSharedWatchlistCollectionItems({
      userId: args.viewerUserId,
      actorUserId: args.actingUserId ?? undefined,
      householdId: args.householdId,
      scope: "HOUSEHOLD",
    });

    items = await buildSharedCollectionItems({
      items: shared.items,
      preferredProviders: args.preferredProviders,
      contextLabel: shared.contextLabel ?? args.contextLabel,
    });
    actionMode = args.isGroupMode ? "shared_group" : "shared_only";
    title = "Collection: Shared for household";
    description =
      "Titles intentionally saved for the broader household without changing anyone's personal taste state.";
    showGroupSaveAction = args.isGroupMode;
    showHouseholdSaveAction = true;
  } else if (args.collection === InteractionType.WATCHED) {
    items = args.isGroupMode
      ? await buildGroupWatchedItems({
          userIds: args.userIds,
          householdId: args.householdId,
          preferredProviders: args.preferredProviders,
          contextLabel: args.contextLabel,
        })
        : await buildGroupedInteractionItems({
            userIds: args.userIds,
            householdId: args.householdId,
            interactionTypes: [InteractionType.WATCHED],
            preferredProviders: args.preferredProviders,
            isGroupMode: false,
            contextLabel: args.contextLabel,
            kind: "watched",
          });
    title = args.isGroupMode ? "Collection: Watched together" : "Collection: Watched";
  } else {
    items = await buildGroupedInteractionItems({
      userIds: args.userIds,
      householdId: args.householdId,
      interactionTypes: [args.collection],
      preferredProviders: args.preferredProviders,
      isGroupMode: args.isGroupMode,
      contextLabel: args.contextLabel,
      kind:
        args.collection === InteractionType.WATCHLIST
          ? "watchlist"
          : args.collection === InteractionType.LIKE
            ? "liked"
            : "deprioritized",
    });

    if (args.collection === InteractionType.WATCHLIST && args.isGroupMode) {
      actionMode = "group_watch";
    }

    title =
      `Collection: ${
        args.collection === InteractionType.WATCHLIST
          ? args.isGroupMode
            ? "Personal watchlists in this group"
            : "Watchlist"
          : args.collection === InteractionType.LIKE
            ? "Liked"
            : args.collection === InteractionType.DISLIKE
              ? "Disliked"
              : "Hidden"
      }`;
    showGroupSaveAction = args.collection === InteractionType.WATCHLIST && args.isGroupMode;
    showHouseholdSaveAction = args.collection === InteractionType.WATCHLIST;
  }

  return {
    id: "collection",
    title,
    description,
    emptyMessage: "Nothing in this collection matched the current view.",
    items: applyFocusAndSort(items, args.focus, args.sort).slice(0, 12),
    actionMode,
    showGroupSaveAction,
    showHouseholdSaveAction,
  } satisfies LibrarySection;
}

export async function getLibraryWorkspace(args: {
  userId: string;
  householdId: string;
  focus?: string;
  sort?: string;
  collection?: string;
}) : Promise<LibraryWorkspace> {
  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.userId,
    householdId: args.householdId,
  });
  const focus = LIBRARY_FOCUS_OPTIONS.includes(args.focus as LibraryFocus)
    ? (args.focus as LibraryFocus)
    : "all";
  const sort = LIBRARY_SORT_OPTIONS.includes(args.sort as LibrarySort)
    ? (args.sort as LibrarySort)
    : "smart";
  const collection = LIBRARY_COLLECTION_OPTIONS.includes(
    args.collection as LibraryCollection,
  )
    ? (args.collection as LibraryCollection)
    : "overview";
  const context = bootstrap.context;
  const contextLabel = buildContextLabel(context.activeNames, context.isGroupMode);
  const actingUserId = context.isGroupMode ? null : context.selectedUserIds[0] ?? args.userId;
  const watchlistSections = await buildWatchlistSections({
    userIds: context.selectedUserIds,
    householdId: args.householdId,
    contextLabel,
    isGroupMode: context.isGroupMode,
    focus,
    sort,
  });
  const preferredProviders = watchlistSections.profile.preferredProviders;
  const sharedGroupCollection = context.isGroupMode
    ? await getSharedWatchlistCollectionItems({
        userId: args.userId,
        actorUserId: args.userId,
        householdId: args.householdId,
        scope: "GROUP",
      })
    : { contextLabel: null, items: [] as Awaited<
        ReturnType<typeof getSharedWatchlistCollectionItems>
      >["items"] };
  const sharedHouseholdCollection = await getSharedWatchlistCollectionItems({
    userId: args.userId,
    actorUserId: actingUserId ?? args.userId,
    householdId: args.householdId,
    scope: "HOUSEHOLD",
  });
  const sharedOverviewTitleCacheIds = [
    ...sharedGroupCollection.items.map((item) => item.titleCacheId),
    ...sharedHouseholdCollection.items.map((item) => item.titleCacheId),
  ];
  const sharedOverviewWatchMap = context.isGroupMode
    ? await getGroupWatchStateMap({
        householdId: args.householdId,
        userIds: context.selectedUserIds,
        titleCacheIds: sharedOverviewTitleCacheIds,
      })
    : new Map<string, GroupWatchState>();
  const sharedGroupOverviewItems = context.isGroupMode
    ? applyFocusAndSort(
        (await buildSharedCollectionItems({
          items: sharedGroupCollection.items,
          preferredProviders,
          contextLabel: sharedGroupCollection.contextLabel ?? contextLabel,
        })).filter(
          (item) => !sharedOverviewWatchMap.get(item.titleCacheId)?.isWatchedByCurrentGroup,
        ),
        focus,
        sort,
      ).slice(0, 6)
    : [];
  const sharedHouseholdOverviewItems = applyFocusAndSort(
    (await buildSharedCollectionItems({
      items: sharedHouseholdCollection.items,
      preferredProviders,
      contextLabel: sharedHouseholdCollection.contextLabel ?? contextLabel,
    })).filter(
      (item) =>
        !context.isGroupMode ||
        !sharedOverviewWatchMap.get(item.titleCacheId)?.isWatchedByCurrentGroup,
    ),
    focus,
    sort,
  ).slice(0, 6);
  const sharedSections: LibrarySection[] = [];

  if (context.isGroupMode) {
    sharedSections.push({
      id: "shared_group",
      title: `Shared for ${sharedGroupCollection.contextLabel ?? contextLabel}`,
      description:
        "Titles intentionally saved for this exact group, kept separate from each member's personal watchlist.",
      emptyMessage:
        "Nothing is currently saved just for this group that still needs a fresh shared decision.",
      items: sharedGroupOverviewItems,
      actionMode: "shared_group",
      showGroupSaveAction: true,
      showHouseholdSaveAction: true,
    });
  }

  sharedSections.push({
    id: "shared_household",
    title: "Shared for household",
    description: context.isGroupMode
      ? "Household-shared planning titles that still look viable for this active group."
      : "Titles saved for the broader household without turning them into your personal watchlist.",
    emptyMessage: context.isGroupMode
      ? "No household-shared titles currently stand out for this group."
      : "Nothing is currently saved for the household.",
    items: sharedHouseholdOverviewItems,
    actionMode: context.isGroupMode ? "shared_group" : "shared_only",
    showGroupSaveAction: context.isGroupMode,
    showHouseholdSaveAction: true,
  });
  const watchedSection: LibrarySection = {
    id: "watched",
    title: context.isGroupMode ? "Already watched together" : "Already watched",
    description: context.isGroupMode
      ? "Titles this exact group already watched together."
      : "Titles already watched in this solo profile.",
    emptyMessage: context.isGroupMode
      ? "This exact group has not marked anything watched together yet."
      : "Nothing in this profile has been marked watched yet.",
    items: applyFocusAndSort(
      context.isGroupMode
        ? await buildGroupWatchedItems({
            userIds: context.selectedUserIds,
            householdId: args.householdId,
            preferredProviders,
            contextLabel,
          })
        : await buildGroupedInteractionItems({
            userIds: context.selectedUserIds,
            householdId: args.householdId,
            interactionTypes: [InteractionType.WATCHED],
            preferredProviders,
            isGroupMode: false,
            contextLabel,
            kind: "watched",
          }),
      focus,
      sort,
    ).slice(0, 6),
    actionMode: context.isGroupMode ? "none" : "solo_full",
  };
  const deprioritizedSection: LibrarySection = {
    id: "deprioritized",
    title: context.isGroupMode ? "Deprioritized for this group" : "Hidden / not interested",
    description: context.isGroupMode
      ? "Titles one or more selected members already pushed out of the decision stack."
      : "Titles hidden or disliked in this solo profile, kept visible for cleanup.",
    emptyMessage: context.isGroupMode
      ? "Nothing in this group's current mix has been pushed down yet."
      : "Nothing in this profile is hidden or marked not interested.",
    items: applyFocusAndSort(
      await buildGroupedInteractionItems({
        userIds: context.selectedUserIds,
        householdId: args.householdId,
        interactionTypes: [InteractionType.DISLIKE, InteractionType.HIDE],
        preferredProviders,
        isGroupMode: context.isGroupMode,
        contextLabel,
        kind: "deprioritized",
      }),
      focus,
      sort,
    ).slice(0, 6),
    actionMode: context.isGroupMode ? "none" : "solo_full",
  };
  const collectionSection = await buildCollectionSection({
    collection,
    userIds: context.selectedUserIds,
    viewerUserId: args.userId,
    actingUserId,
    householdId: args.householdId,
    preferredProviders,
    contextLabel,
    isGroupMode: context.isGroupMode,
    focus,
    sort,
  });

  const sections = [
    collectionSection,
    ...watchlistSections.sections,
    ...sharedSections,
    watchedSection,
    deprioritizedSection,
  ].filter((section): section is LibrarySection => Boolean(section));

  const actionableTitleCacheIds = sections
    .filter(
      (section) =>
        section.actionMode === "group_watch" || section.actionMode === "shared_group",
    )
    .flatMap((section) => section.items.map((item) => item.titleCacheId));
  const groupWatchStateMap = context.isGroupMode
    ? await getGroupWatchStateMap({
        householdId: args.householdId,
        userIds: context.selectedUserIds,
        titleCacheIds: actionableTitleCacheIds,
      })
    : new Map<string, GroupWatchState>();
  const interactionMap = actingUserId
    ? await getInteractionMap(
        actingUserId,
        sections.flatMap((section) =>
          section.items.map((item) => ({
            tmdbId: item.title.tmdbId,
            mediaType: item.title.mediaType,
          })),
        ),
      )
    : new Map<string, InteractionType[]>();
  const sharedWatchlistStateMap = await getCurrentSharedWatchlistStateMap({
    userId: args.userId,
    actorUserId: actingUserId ?? args.userId,
    householdId: args.householdId,
    titleCacheIds: [...new Set(sections.flatMap((section) => section.items.map((item) => item.titleCacheId)))],
  });

  return {
    contextLabel,
    mode: context.mode,
    isGroupMode: context.isGroupMode,
    actingUserId,
    focus,
    sort,
    collection,
    sections: sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        activeTypes:
          section.actionMode === "solo_full"
            ? interactionMap.get(item.tmdbKey) ?? []
            : item.activeTypes,
        activeGroupWatch:
          section.actionMode === "group_watch" || section.actionMode === "shared_group"
            ? groupWatchStateMap.get(item.titleCacheId)
            : item.activeGroupWatch,
        sharedWatchlistState:
          sharedWatchlistStateMap.get(item.titleCacheId) ?? item.sharedWatchlistState,
      })),
    })),
  };
}
