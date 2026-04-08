import {
  InteractionType,
  SourceContext,
} from "@prisma/client";

import type {
  MediaTypeKey,
  PersonalInteractionSourceState,
  TitleDetails,
  TitleSummary,
} from "@/lib/types";
import { mapTitleCacheToSummary, toTmdbKey, upsertTitleSummary } from "@/lib/services/title-cache";
import { getPersonalInteractionOrigin } from "@/lib/personal-interaction-sources";
import { prisma } from "@/lib/prisma";

const CONFLICTING_INTERACTIONS: Partial<Record<InteractionType, InteractionType[]>> = {
  LIKE: [InteractionType.DISLIKE, InteractionType.HIDE],
  DISLIKE: [InteractionType.LIKE, InteractionType.HIDE],
  HIDE: [InteractionType.LIKE, InteractionType.DISLIKE, InteractionType.WATCHLIST],
  WATCHED: [InteractionType.WATCHLIST],
};

const IMPORTED_SOURCE_CONTEXTS = [
  SourceContext.IMPORTED,
  SourceContext.NETFLIX_IMPORTED,
] as const;

export async function setInteraction(args: {
  userId: string;
  title: TitleSummary;
  interactionType: InteractionType;
  active: boolean;
  sourceContext?: SourceContext;
  groupRunId?: string;
}) {
  const cachedTitle = await upsertTitleSummary(args.title);

  if (!args.active) {
    await prisma.userTitleInteraction.deleteMany({
      where: {
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: args.interactionType,
      },
    });

    return;
  }

  await prisma.$transaction(async (tx) => {
    const conflicts = CONFLICTING_INTERACTIONS[args.interactionType] ?? [];

    if (conflicts.length > 0) {
      await tx.userTitleInteraction.deleteMany({
        where: {
          userId: args.userId,
          titleCacheId: cachedTitle.id,
          interactionType: { in: conflicts },
        },
      });
    }

    await tx.userTitleInteraction.upsert({
      where: {
        userId_titleCacheId_interactionType: {
          userId: args.userId,
          titleCacheId: cachedTitle.id,
          interactionType: args.interactionType,
        },
      },
      update: {
        sourceContext: args.sourceContext ?? SourceContext.MANUAL,
        groupRunId: args.groupRunId ?? null,
      },
      create: {
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: args.interactionType,
        sourceContext: args.sourceContext ?? SourceContext.MANUAL,
        groupRunId: args.groupRunId ?? null,
      },
    });
  });
}

export async function getInteractionMap(
  userId: string,
  titles: Array<{ tmdbId: number; mediaType: MediaTypeKey }>,
) {
  if (titles.length === 0) {
    return new Map<string, InteractionType[]>();
  }

  const matches = await prisma.userTitleInteraction.findMany({
    where: {
      userId,
      OR: titles.map((title) => ({
        title: {
          tmdbId: title.tmdbId,
          mediaType: title.mediaType === "movie" ? "MOVIE" : "TV",
        },
      })),
    },
    include: {
      title: true,
    },
  });

  const map = new Map<string, InteractionType[]>();

  matches.forEach((interaction) => {
    const key = toTmdbKey(
      interaction.title.tmdbId,
      interaction.title.mediaType === "MOVIE" ? "movie" : "tv",
    );
    const existing = map.get(key) ?? [];
    map.set(key, [...existing, interaction.interactionType]);
  });

  return map;
}

export async function getInteractionSourceStateMap(args: {
  userId: string;
  titleCacheIds: string[];
}) {
  if (args.titleCacheIds.length === 0) {
    return new Map<string, PersonalInteractionSourceState>();
  }

  const interactions = await prisma.userTitleInteraction.findMany({
    where: {
      userId: args.userId,
      titleCacheId: {
        in: args.titleCacheIds,
      },
    },
    select: {
      titleCacheId: true,
      interactionType: true,
      sourceContext: true,
    },
  });

  const map = new Map<string, PersonalInteractionSourceState>();

  interactions.forEach((interaction) => {
    const existing = map.get(interaction.titleCacheId) ?? {};

    existing[interaction.interactionType] = getPersonalInteractionOrigin(
      interaction.sourceContext,
    );
    map.set(interaction.titleCacheId, existing);
  });

  return map;
}

export type ClearImportedInteractionKind = "watchlist" | "watched" | "taste";

export function getImportedInteractionTypesForKind(
  kind: ClearImportedInteractionKind,
) {
  if (kind === "watchlist") {
    return [InteractionType.WATCHLIST];
  }

  if (kind === "watched") {
    return [InteractionType.WATCHED];
  }

  return [InteractionType.LIKE, InteractionType.DISLIKE];
}

export async function clearImportedInteractionState(args: {
  userId: string;
  title: TitleSummary;
  kind: ClearImportedInteractionKind;
}) {
  const cachedTitle = await upsertTitleSummary(args.title);
  const interactionTypes = getImportedInteractionTypesForKind(args.kind);
  const cleared = await prisma.userTitleInteraction.deleteMany({
    where: {
      userId: args.userId,
      titleCacheId: cachedTitle.id,
      interactionType: {
        in: interactionTypes,
      },
      sourceContext: {
        in: [...IMPORTED_SOURCE_CONTEXTS],
      },
    },
  });

  return {
    cleared: cleared.count,
    titleCacheId: cachedTitle.id,
  };
}

export async function getLibraryItems(
  userId: string,
  interactionType: InteractionType,
) {
  const interactions = await prisma.userTitleInteraction.findMany({
    where: {
      userId,
      interactionType,
    },
    include: {
      title: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return interactions.map((interaction) => ({
    interactionId: interaction.id,
    title: mapTitleCacheToSummary(interaction.title),
    updatedAt: interaction.updatedAt.toISOString(),
  }));
}

const TASTE_INTERACTIONS_PER_USER = 500;

export async function getInteractionsForTaste(userIds: string[]) {
  return prisma.userTitleInteraction.findMany({
    where: {
      userId: { in: userIds },
    },
    orderBy: { updatedAt: "desc" },
    take: TASTE_INTERACTIONS_PER_USER * userIds.length,
    include: {
      title: true,
      user: {
        select: {
          id: true,
          name: true,
          preferredProviders: true,
          defaultMediaType: true,
        },
      },
    },
  });
}

export function hasInteraction(
  interactionMap: Map<string, InteractionType[]>,
  title: { tmdbId: number; mediaType: MediaTypeKey },
  type: InteractionType,
) {
  return (interactionMap.get(toTmdbKey(title.tmdbId, title.mediaType)) ?? []).includes(
    type,
  );
}

export type WatchedHistoryItem = {
  titleCacheId: string;
  title: TitleSummary;
  watchedAt: string;
  origin: "netflix" | "trakt" | "manual";
  rating: "LIKE" | "DISLIKE" | null;
};

const HISTORY_IMPORTED_CONTEXTS = [
  SourceContext.IMPORTED,
  SourceContext.NETFLIX_IMPORTED,
] as const;

export async function getWatchedHistoryForReview(
  userId: string,
  sourceFilter: "all" | "imported" | "manual" = "all",
): Promise<WatchedHistoryItem[]> {
  const whereSource =
    sourceFilter === "imported"
      ? { sourceContext: { in: [...HISTORY_IMPORTED_CONTEXTS] } }
      : sourceFilter === "manual"
        ? { sourceContext: { notIn: [...HISTORY_IMPORTED_CONTEXTS] } }
        : {};

  const watched = await prisma.userTitleInteraction.findMany({
    where: {
      userId,
      interactionType: InteractionType.WATCHED,
      ...whereSource,
    },
    include: { title: true },
    orderBy: { updatedAt: "desc" },
  });

  if (watched.length === 0) {
    return [];
  }

  const titleCacheIds = watched.map((w) => w.titleCacheId);

  const ratingRows = await prisma.userTitleInteraction.findMany({
    where: {
      userId,
      titleCacheId: { in: titleCacheIds },
      interactionType: { in: [InteractionType.LIKE, InteractionType.DISLIKE] },
    },
    select: { titleCacheId: true, interactionType: true },
  });

  const ratingMap = new Map<string, "LIKE" | "DISLIKE">();
  for (const row of ratingRows) {
    ratingMap.set(
      row.titleCacheId,
      row.interactionType === InteractionType.LIKE ? "LIKE" : "DISLIKE",
    );
  }

  const items: WatchedHistoryItem[] = watched.map((w) => ({
    titleCacheId: w.titleCacheId,
    title: mapTitleCacheToSummary(w.title),
    watchedAt: w.updatedAt.toISOString(),
    origin: getPersonalInteractionOrigin(w.sourceContext),
    rating: ratingMap.get(w.titleCacheId) ?? null,
  }));

  // Sort: unrated imported → unrated manual → rated (most recently watched first within each group)
  const rank = (item: WatchedHistoryItem) => {
    if (item.rating !== null) return 2;
    if (item.origin !== "manual") return 0; // imported (netflix or trakt)
    return 1;
  };

  return items.sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return b.watchedAt.localeCompare(a.watchedAt);
  });
}
