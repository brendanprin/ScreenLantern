import { prisma } from "@/lib/prisma";
import { recordGroupWatchActivity } from "@/lib/services/activity";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";
import { toTmdbKey, upsertTitleCache } from "@/lib/services/title-cache";
import type { GroupWatchState, TitleDetails, TitleSummary } from "@/lib/types";

export function buildParticipantKey(userIds: string[]) {
  return [...new Set(userIds.filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

export async function createGroupWatchSession(args: {
  userId: string;
  householdId: string;
  title: TitleSummary | TitleDetails;
}) {
  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.userId,
    householdId: args.householdId,
  });

  if (!bootstrap.context.isGroupMode) {
    throw new Error("Switch to a group context before marking a title watched by the group.");
  }

  const cachedTitle = await upsertTitleCache(args.title);
  const participantKey = buildParticipantKey(bootstrap.context.selectedUserIds);
  const actorName =
    bootstrap.householdMembers.find((member) => member.id === args.userId)?.name ??
    "A household member";
  const contextLabel = bootstrap.context.activeNames.join(" + ") || "this group";

  return prisma.$transaction(async (tx) => {
    const existingSession = await tx.groupWatchSession.findUnique({
      where: {
        householdId_titleCacheId_participantKey: {
          householdId: args.householdId,
          titleCacheId: cachedTitle.id,
          participantKey,
        },
      },
    });

    if (existingSession) {
      return existingSession;
    }

    const watchSession = await tx.groupWatchSession.create({
      data: {
        householdId: args.householdId,
        titleCacheId: cachedTitle.id,
        createdById: args.userId,
        savedGroupId: bootstrap.context.savedGroupId,
        participantKey,
        participantUserIds: bootstrap.context.selectedUserIds,
      },
    });

    await recordGroupWatchActivity({
      tx,
      householdId: args.householdId,
      actorUserId: args.userId,
      actorName,
      title: {
        id: cachedTitle.id,
        title: cachedTitle.title,
      },
      participantNames: bootstrap.context.activeNames,
      contextLabel,
    });

    return watchSession;
  });
}

export async function getCurrentContextGroupWatchState(args: {
  userId: string;
  householdId: string;
  titleCacheId: string;
}): Promise<GroupWatchState> {
  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.userId,
    householdId: args.householdId,
  });

  if (!bootstrap.context.isGroupMode) {
    return {
      isWatchedByCurrentGroup: false,
      watchedAt: null,
    };
  }

  const watchSession = await prisma.groupWatchSession.findUnique({
    where: {
      householdId_titleCacheId_participantKey: {
        householdId: args.householdId,
        titleCacheId: args.titleCacheId,
        participantKey: buildParticipantKey(bootstrap.context.selectedUserIds),
      },
    },
    select: {
      watchedAt: true,
    },
  });

  return {
    isWatchedByCurrentGroup: Boolean(watchSession),
    watchedAt: watchSession?.watchedAt.toISOString() ?? null,
  };
}

export async function getGroupWatchedTmdbKeys(args: {
  householdId: string;
  userIds: string[];
}) {
  const watchSessions = await prisma.groupWatchSession.findMany({
    where: {
      householdId: args.householdId,
      participantKey: buildParticipantKey(args.userIds),
    },
    select: {
      title: {
        select: {
          tmdbId: true,
          mediaType: true,
        },
      },
    },
  });

  return new Set(
    watchSessions.map((watchSession) =>
      toTmdbKey(
        watchSession.title.tmdbId,
        watchSession.title.mediaType === "MOVIE" ? "movie" : "tv",
      ),
    ),
  );
}

export async function getGroupWatchStateMap(args: {
  householdId: string;
  userIds: string[];
  titleCacheIds: string[];
}) {
  if (args.userIds.length < 2 || args.titleCacheIds.length === 0) {
    return new Map<string, GroupWatchState>();
  }

  const watchSessions = await prisma.groupWatchSession.findMany({
    where: {
      householdId: args.householdId,
      participantKey: buildParticipantKey(args.userIds),
      titleCacheId: {
        in: args.titleCacheIds,
      },
    },
    select: {
      titleCacheId: true,
      watchedAt: true,
    },
  });

  return new Map(
    watchSessions.map((watchSession) => [
      watchSession.titleCacheId,
      {
        isWatchedByCurrentGroup: true,
        watchedAt: watchSession.watchedAt.toISOString(),
      } satisfies GroupWatchState,
    ]),
  );
}
