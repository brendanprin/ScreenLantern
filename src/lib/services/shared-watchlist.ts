import { SharedWatchlistScope } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { recordSharedWatchlistActivity } from "@/lib/services/activity";
import { buildParticipantKey } from "@/lib/services/group-watch-sessions";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";
import { mapTitleCacheToSummary, upsertTitleSummary } from "@/lib/services/title-cache";
import type {
  SharedWatchlistScopeKey,
  SharedWatchlistTitleState,
  TitleDetails,
  TitleSummary,
} from "@/lib/types";

export interface AggregatedSharedWatchlistItem {
  titleCacheId: string;
  title: TitleSummary;
  scope: SharedWatchlistScopeKey;
  contextKey: string;
  contextLabel: string;
  savedByNames: string[];
  isSavedByViewer: boolean;
  updatedAt: string;
}

function sortNames(names: Iterable<string>) {
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

export function buildSharedWatchlistContextKey(args: {
  scope: SharedWatchlistScopeKey;
  householdId: string;
  selectedUserIds?: string[];
}) {
  if (args.scope === "HOUSEHOLD") {
    return `HOUSEHOLD:${args.householdId}`;
  }

  return `GROUP:${buildParticipantKey(args.selectedUserIds ?? [])}`;
}

async function resolveSharedWatchlistContext(args: {
  viewerUserId: string;
  householdId: string;
  actorUserId: string;
  scope: SharedWatchlistScopeKey;
}) {
  const actor = await prisma.user.findFirst({
    where: {
      id: args.actorUserId,
      householdId: args.householdId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!actor) {
    throw new Error("You cannot update shared saves for that profile.");
  }

  if (args.scope === "HOUSEHOLD") {
    const household = await prisma.household.findUniqueOrThrow({
      where: {
        id: args.householdId,
      },
      select: {
        name: true,
      },
    });

    return {
      actorId: actor.id,
      actorName: actor.name,
      contextKey: buildSharedWatchlistContextKey({
        scope: "HOUSEHOLD",
        householdId: args.householdId,
      }),
      contextLabel: household.name,
      selectedUserIds: [] as string[],
      savedGroupId: null as string | null,
    };
  }

  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.viewerUserId,
    householdId: args.householdId,
  });

  if (!bootstrap.context.isGroupMode) {
    throw new Error("Switch to a group context before saving for the current group.");
  }

  return {
    actorId: actor.id,
    actorName: actor.name,
    contextKey: buildSharedWatchlistContextKey({
      scope: "GROUP",
      householdId: args.householdId,
      selectedUserIds: bootstrap.context.selectedUserIds,
    }),
    contextLabel: bootstrap.context.activeNames.join(" + ") || "this group",
    selectedUserIds: bootstrap.context.selectedUserIds,
    savedGroupId: bootstrap.context.savedGroupId,
  };
}

export async function setSharedWatchlistSave(args: {
  viewerUserId: string;
  actingUserId?: string;
  householdId: string;
  title: TitleSummary;
  scope: SharedWatchlistScopeKey;
  active: boolean;
}) {
  const context = await resolveSharedWatchlistContext({
    viewerUserId: args.viewerUserId,
    householdId: args.householdId,
    actorUserId: args.actingUserId ?? args.viewerUserId,
    scope: args.scope,
  });
  const cachedTitle = await upsertTitleSummary(args.title);

  await prisma.$transaction(async (tx) => {
    const existingEntry = await tx.sharedWatchlistEntry.findUnique({
      where: {
        savedById_contextKey_titleCacheId: {
          savedById: context.actorId,
          contextKey: context.contextKey,
          titleCacheId: cachedTitle.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!args.active) {
      if (!existingEntry) {
        return;
      }

      await tx.sharedWatchlistEntry.delete({
        where: {
          savedById_contextKey_titleCacheId: {
            savedById: context.actorId,
            contextKey: context.contextKey,
            titleCacheId: cachedTitle.id,
          },
        },
      });

      await recordSharedWatchlistActivity({
        tx,
        householdId: args.householdId,
        actorUserId: context.actorId,
        actorName: context.actorName,
        title: {
          id: cachedTitle.id,
          title: cachedTitle.title,
        },
        scope: args.scope,
        contextLabel: context.contextLabel,
        active: false,
      });

      return;
    }

    if (existingEntry) {
      await tx.sharedWatchlistEntry.update({
        where: {
          savedById_contextKey_titleCacheId: {
            savedById: context.actorId,
            contextKey: context.contextKey,
            titleCacheId: cachedTitle.id,
          },
        },
        data: {
          householdId: args.householdId,
          scope:
            args.scope === "GROUP"
              ? SharedWatchlistScope.GROUP
              : SharedWatchlistScope.HOUSEHOLD,
          contextLabel: context.contextLabel,
          selectedUserIds: context.selectedUserIds,
          savedGroupId: context.savedGroupId,
        },
      });

      return;
    }

    await tx.sharedWatchlistEntry.create({
      data: {
        householdId: args.householdId,
        titleCacheId: cachedTitle.id,
        scope:
          args.scope === "GROUP"
            ? SharedWatchlistScope.GROUP
            : SharedWatchlistScope.HOUSEHOLD,
        contextKey: context.contextKey,
        contextLabel: context.contextLabel,
        selectedUserIds: context.selectedUserIds,
        savedGroupId: context.savedGroupId,
        savedById: context.actorId,
      },
    });

    await recordSharedWatchlistActivity({
      tx,
      householdId: args.householdId,
      actorUserId: context.actorId,
      actorName: context.actorName,
      title: {
        id: cachedTitle.id,
        title: cachedTitle.title,
      },
      scope: args.scope,
      contextLabel: context.contextLabel,
      active: true,
    });
  });
}

function buildPresence(args: {
  entries: Array<{
    savedById: string;
    savedBy: {
      name: string;
    };
  }>;
  viewerUserId: string;
  contextLabel: string;
}) {
  if (args.entries.length === 0) {
    return null;
  }

  return {
    isSaved: true,
    isSavedByViewer: args.entries.some((entry) => entry.savedById === args.viewerUserId),
    savedByNames: sortNames(args.entries.map((entry) => entry.savedBy.name)),
    contextLabel: args.contextLabel,
  };
}

export async function getCurrentSharedWatchlistState(args: {
  userId: string;
  actorUserId?: string;
  householdId: string;
  titleCacheId: string;
}): Promise<SharedWatchlistTitleState> {
  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.userId,
    householdId: args.householdId,
  });
  const actingUserId = args.actorUserId ?? args.userId;
  const household = await prisma.household.findUniqueOrThrow({
    where: {
      id: args.householdId,
    },
    select: {
      name: true,
    },
  });
  const householdContextKey = buildSharedWatchlistContextKey({
    scope: "HOUSEHOLD",
    householdId: args.householdId,
  });
  const groupContextKey = bootstrap.context.isGroupMode
    ? buildSharedWatchlistContextKey({
        scope: "GROUP",
        householdId: args.householdId,
        selectedUserIds: bootstrap.context.selectedUserIds,
      })
    : null;
  const entries = await prisma.sharedWatchlistEntry.findMany({
    where: {
      householdId: args.householdId,
      titleCacheId: args.titleCacheId,
      contextKey: {
        in: [householdContextKey, groupContextKey].filter(
          (value): value is string => Boolean(value),
        ),
      },
    },
    include: {
      savedBy: {
        select: {
          name: true,
        },
      },
    },
  });

  return {
    group: buildPresence({
      entries: entries.filter((entry) => entry.contextKey === groupContextKey),
      viewerUserId: args.actorUserId ?? args.userId,
      contextLabel: bootstrap.context.activeNames.join(" + ") || "this group",
    }),
    household: buildPresence({
      entries: entries.filter((entry) => entry.contextKey === householdContextKey),
      viewerUserId: args.actorUserId ?? args.userId,
      contextLabel: household.name,
    }),
  };
}

export async function getCurrentSharedWatchlistStateMap(args: {
  userId: string;
  actorUserId?: string;
  householdId: string;
  titleCacheIds: string[];
}) {
  if (args.titleCacheIds.length === 0) {
    return new Map<string, SharedWatchlistTitleState>();
  }

  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.userId,
    householdId: args.householdId,
  });
  const household = await prisma.household.findUniqueOrThrow({
    where: {
      id: args.householdId,
    },
    select: {
      name: true,
    },
  });
  const householdContextKey = buildSharedWatchlistContextKey({
    scope: "HOUSEHOLD",
    householdId: args.householdId,
  });
  const groupContextKey = bootstrap.context.isGroupMode
    ? buildSharedWatchlistContextKey({
        scope: "GROUP",
        householdId: args.householdId,
        selectedUserIds: bootstrap.context.selectedUserIds,
      })
    : null;

  const entries = await prisma.sharedWatchlistEntry.findMany({
    where: {
      householdId: args.householdId,
      titleCacheId: {
        in: args.titleCacheIds,
      },
      contextKey: {
        in: [householdContextKey, groupContextKey].filter(
          (value): value is string => Boolean(value),
        ),
      },
    },
    include: {
      savedBy: {
        select: {
          name: true,
        },
      },
    },
  });

  return new Map(
    args.titleCacheIds.map((titleCacheId) => {
      const titleEntries = entries.filter((entry) => entry.titleCacheId === titleCacheId);

      return [
        titleCacheId,
        {
          group: buildPresence({
            entries: titleEntries.filter((entry) => entry.contextKey === groupContextKey),
            viewerUserId: args.actorUserId ?? args.userId,
            contextLabel: bootstrap.context.activeNames.join(" + ") || "this group",
          }),
          household: buildPresence({
            entries: titleEntries.filter(
              (entry) => entry.contextKey === householdContextKey,
            ),
            viewerUserId: args.actorUserId ?? args.userId,
            contextLabel: household.name,
          }),
        } satisfies SharedWatchlistTitleState,
      ];
    }),
  );
}

export async function getSharedWatchlistCollectionItems(args: {
  userId: string;
  actorUserId?: string;
  householdId: string;
  scope: SharedWatchlistScopeKey;
}) {
  const actingUserId = args.actorUserId ?? args.userId;
  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.userId,
    householdId: args.householdId,
  });
  const household = await prisma.household.findUniqueOrThrow({
    where: {
      id: args.householdId,
    },
    select: {
      name: true,
    },
  });

  if (args.scope === "GROUP" && !bootstrap.context.isGroupMode) {
    return {
      contextLabel: null,
      items: [] as AggregatedSharedWatchlistItem[],
    };
  }

  const contextKey =
    args.scope === "GROUP"
      ? buildSharedWatchlistContextKey({
          scope: "GROUP",
          householdId: args.householdId,
          selectedUserIds: bootstrap.context.selectedUserIds,
        })
      : buildSharedWatchlistContextKey({
          scope: "HOUSEHOLD",
          householdId: args.householdId,
        });
  const contextLabel =
    args.scope === "GROUP"
      ? bootstrap.context.activeNames.join(" + ") || "this group"
      : household.name;

  const entries = await prisma.sharedWatchlistEntry.findMany({
    where: {
      householdId: args.householdId,
      contextKey,
    },
    include: {
      title: true,
      savedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const grouped = new Map<
    string,
    {
      titleCacheId: string;
      title: TitleSummary;
      savedByNames: Set<string>;
      isSavedByViewer: boolean;
      updatedAt: Date;
    }
  >();

  entries.forEach((entry) => {
    const key = `${entry.title.tmdbId}:${entry.title.mediaType}`;
    const existing = grouped.get(key);
    const title = mapTitleCacheToSummary(entry.title);

    if (existing) {
      existing.savedByNames.add(entry.savedBy.name);
      existing.isSavedByViewer =
        existing.isSavedByViewer || entry.savedBy.id === actingUserId;
      if (entry.updatedAt > existing.updatedAt) {
        existing.updatedAt = entry.updatedAt;
      }
      return;
    }

    grouped.set(key, {
      titleCacheId: entry.titleCacheId,
      title,
      savedByNames: new Set([entry.savedBy.name]),
      isSavedByViewer: entry.savedBy.id === actingUserId,
      updatedAt: entry.updatedAt,
    });
  });

  return {
    contextLabel,
    items: [...grouped.values()].map((entry) => ({
      titleCacheId: entry.titleCacheId,
      title: entry.title,
      scope: args.scope,
      contextKey,
      contextLabel,
      savedByNames: sortNames(entry.savedByNames),
      isSavedByViewer: entry.isSavedByViewer,
      updatedAt: entry.updatedAt.toISOString(),
    })),
  };
}
