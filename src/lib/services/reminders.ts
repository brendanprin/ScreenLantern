import {
  RecommendationMode,
  ReminderCategory,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getRecommendationContextBootstrap,
  resolveRecommendationContextState,
} from "@/lib/services/recommendation-context";
import {
  getWatchlistResurfacingSnapshot,
  type WatchlistResurfacingCandidate,
} from "@/lib/services/recommendations";
import { mapTitleCacheToSummary } from "@/lib/services/title-cache";
import type {
  RecommendationExplanation,
  RecommendationModeKey,
  ReminderCategoryKey,
  ReminderInboxResult,
  ReminderItem,
} from "@/lib/types";

function normalizeSelectedUserIds(userIds: string[]) {
  return [...new Set(userIds.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function buildReminderContextKey(args: {
  mode: RecommendationModeKey;
  selectedUserIds: string[];
}) {
  return `${args.mode}:${normalizeSelectedUserIds(args.selectedUserIds).join("|")}`;
}

function buildReminderContextLabel(activeNames: string[], isGroupMode: boolean) {
  if (isGroupMode) {
    return activeNames.join(" + ") || "this group";
  }

  return activeNames[0] ?? "you";
}

export function mapReminderCategory(args: {
  laneId: WatchlistResurfacingCandidate["laneId"];
  isGroupMode: boolean;
}): ReminderCategory {
  if (args.laneId === "available_now") {
    return ReminderCategory.AVAILABLE_NOW;
  }

  return args.isGroupMode
    ? ReminderCategory.GROUP_WATCH_CANDIDATE
    : ReminderCategory.WATCHLIST_RESURFACE;
}

function toReminderCategoryKey(category: ReminderCategory): ReminderCategoryKey {
  if (category === ReminderCategory.AVAILABLE_NOW) {
    return "available_now";
  }

  if (category === ReminderCategory.GROUP_WATCH_CANDIDATE) {
    return "group_watch_candidate";
  }

  return "watchlist_resurface";
}

function reminderBadgesForCategory(category: ReminderCategory): string[] {
  return category === ReminderCategory.AVAILABLE_NOW ? ["Available now"] : [];
}

function parseExplanationJson(
  value: Prisma.JsonValue | null,
): RecommendationExplanation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const category =
      typeof record.category === "string" ? record.category : null;
    const summary = typeof record.summary === "string" ? record.summary : null;
    const detail =
      typeof record.detail === "string" || record.detail === null
        ? record.detail
        : null;

    if (!category || !summary) {
      return [];
    }

    return [
      {
        category: category as RecommendationExplanation["category"],
        summary,
        detail,
      },
    ];
  });
}

function toReminderModeKey(mode: RecommendationMode) {
  return mode === RecommendationMode.GROUP ? "GROUP" : "SOLO";
}

export function buildReminderDraft(args: {
  candidate: WatchlistResurfacingCandidate;
  contextLabel: string;
  mode: RecommendationModeKey;
  selectedUserIds: string[];
  savedGroupId: string | null;
  isGroupMode: boolean;
}) {
  const category = mapReminderCategory({
    laneId: args.candidate.laneId,
    isGroupMode: args.isGroupMode,
  });
  const primaryExplanation = args.candidate.item.explanations[0];

  return {
    category,
    titleCacheId: args.candidate.titleCacheId,
    contextKey: buildReminderContextKey({
      mode: args.mode,
      selectedUserIds: args.selectedUserIds,
    }),
    contextLabel: args.contextLabel,
    selectedUserIds: normalizeSelectedUserIds(args.selectedUserIds),
    savedGroupId: args.savedGroupId,
    summary:
      primaryExplanation?.summary ??
      (category === ReminderCategory.AVAILABLE_NOW
        ? "Available now on your services"
        : args.isGroupMode
          ? "Worth bringing back to this group"
          : "Back on your radar"),
    detail: primaryExplanation?.detail ?? null,
    explanations: args.candidate.item.explanations,
  };
}

async function resolveReminderContext(args: {
  userId: string;
  householdId: string;
  requestedMode?: RecommendationModeKey | null;
  requestedUserIds?: string[];
  requestedSavedGroupId?: string | null;
}) {
  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.userId,
    householdId: args.householdId,
  });

  if (
    !args.requestedMode &&
    (!args.requestedUserIds || args.requestedUserIds.length === 0) &&
    !args.requestedSavedGroupId
  ) {
    return bootstrap.context;
  }

  return resolveRecommendationContextState({
    viewerUserId: args.userId,
    householdMembers: bootstrap.householdMembers,
    savedGroups: bootstrap.savedGroups,
    storedContext: {
      mode:
        args.requestedMode ??
        ((args.requestedUserIds?.length ?? 0) > 1 ? "GROUP" : "SOLO"),
      selectedUserIds: args.requestedUserIds ?? [],
      savedGroupId: args.requestedSavedGroupId ?? null,
    },
  }).context;
}

async function syncRemindersForContext(args: {
  userId: string;
  householdId: string;
  mode: RecommendationModeKey;
  selectedUserIds: string[];
  savedGroupId: string | null;
  activeNames: string[];
  isGroupMode: boolean;
}) {
  const resurfacing = await getWatchlistResurfacingSnapshot({
    userIds: args.selectedUserIds,
    householdId: args.householdId,
  });
  const contextLabel = buildReminderContextLabel(
    args.activeNames,
    args.isGroupMode,
  );
  const drafts = resurfacing.candidates
    .slice(0, 8)
    .map((candidate) =>
      buildReminderDraft({
        candidate,
        contextLabel,
        mode: args.mode,
        selectedUserIds: args.selectedUserIds,
        savedGroupId: args.savedGroupId,
        isGroupMode: args.isGroupMode,
      }),
    );
  const contextKey = buildReminderContextKey({
    mode: args.mode,
    selectedUserIds: args.selectedUserIds,
  });
  const existing = await prisma.userReminder.findMany({
    where: {
      userId: args.userId,
      contextKey,
    },
    select: {
      id: true,
      category: true,
      titleCacheId: true,
      dismissedAt: true,
    },
  });
  const existingByKey = new Map(
    existing.map((reminder) => [
      `${reminder.category}:${reminder.titleCacheId}`,
      reminder,
    ]),
  );

  await prisma.$transaction(async (tx) => {
    const desiredKeys = new Set<string>();

    for (const draft of drafts) {
      const draftKey = `${draft.category}:${draft.titleCacheId}`;
      desiredKeys.add(draftKey);
      const existingReminder = existingByKey.get(draftKey);

      if (existingReminder) {
        await tx.userReminder.update({
          where: {
            id: existingReminder.id,
          },
          data: {
            householdId: args.householdId,
            mode:
              args.mode === "GROUP"
                ? RecommendationMode.GROUP
                : RecommendationMode.SOLO,
            contextLabel,
            selectedUserIds: draft.selectedUserIds,
            savedGroupId: draft.savedGroupId,
            summary: draft.summary,
            detail: draft.detail,
            explanationJson: draft.explanations as unknown as Prisma.InputJsonValue,
            isActive: existingReminder.dismissedAt ? false : true,
          },
        });
        continue;
      }

      await tx.userReminder.create({
        data: {
          userId: args.userId,
          householdId: args.householdId,
          titleCacheId: draft.titleCacheId,
          mode:
            args.mode === "GROUP"
              ? RecommendationMode.GROUP
              : RecommendationMode.SOLO,
          category: draft.category,
          contextKey,
          contextLabel,
          selectedUserIds: draft.selectedUserIds,
          savedGroupId: draft.savedGroupId,
          summary: draft.summary,
          detail: draft.detail,
          explanationJson: draft.explanations as unknown as Prisma.InputJsonValue,
          isActive: true,
        },
      });
    }

    const staleReminderIds = existing
      .filter(
        (reminder) =>
          !desiredKeys.has(`${reminder.category}:${reminder.titleCacheId}`),
      )
      .map((reminder) => reminder.id);

    if (staleReminderIds.length > 0) {
      await tx.userReminder.updateMany({
        where: {
          id: {
            in: staleReminderIds,
          },
        },
        data: {
          isActive: false,
        },
      });
    }
  });
}

function mapReminderRecordToItem(
  reminder: Prisma.UserReminderGetPayload<{
    include: {
      title: true;
    };
  }>,
): ReminderItem {
  const title = mapTitleCacheToSummary(reminder.title as never);

  return {
    id: reminder.id,
    category: toReminderCategoryKey(reminder.category),
    title,
    contextLabel: reminder.contextLabel,
    mode: toReminderModeKey(reminder.mode),
    summary: reminder.summary,
    detail: reminder.detail,
    explanations: parseExplanationJson(reminder.explanationJson),
    isRead: Boolean(reminder.readAt),
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
    href: `/app/title/${title.mediaType}/${title.tmdbId}`,
    badges: reminderBadgesForCategory(reminder.category),
  };
}

export async function getReminderInbox(args: {
  userId: string;
  householdId: string;
  requestedMode?: RecommendationModeKey | null;
  requestedUserIds?: string[];
  requestedSavedGroupId?: string | null;
  refresh?: boolean;
  summaryOnly?: boolean;
}): Promise<ReminderInboxResult> {
  const context = await resolveReminderContext({
    userId: args.userId,
    householdId: args.householdId,
    requestedMode: args.requestedMode,
    requestedUserIds: args.requestedUserIds,
    requestedSavedGroupId: args.requestedSavedGroupId,
  });
  const contextKey = buildReminderContextKey({
    mode: context.mode,
    selectedUserIds: context.selectedUserIds,
  });

  if (args.refresh !== false) {
    await syncRemindersForContext({
      userId: args.userId,
      householdId: args.householdId,
      mode: context.mode,
      selectedUserIds: context.selectedUserIds,
      savedGroupId: context.savedGroupId,
      activeNames: context.activeNames,
      isGroupMode: context.isGroupMode,
    });
  }

  const reminderWhere = {
    userId: args.userId,
    householdId: args.householdId,
    contextKey,
    isActive: true,
    dismissedAt: null,
  } as const;
  const unreadCount = await prisma.userReminder.count({
    where: {
      ...reminderWhere,
      readAt: null,
    },
  });

  if (args.summaryOnly) {
    return {
      contextLabel: buildReminderContextLabel(
        context.activeNames,
        context.isGroupMode,
      ),
      mode: context.mode,
      isGroupMode: context.isGroupMode,
      unreadCount,
      items: [],
    };
  }

  const reminders = await prisma.userReminder.findMany({
    where: reminderWhere,
    include: {
      title: true,
    },
    orderBy: [{ readAt: "asc" }, { updatedAt: "desc" }],
  });

  return {
    contextLabel: buildReminderContextLabel(
      context.activeNames,
      context.isGroupMode,
    ),
    mode: context.mode,
    isGroupMode: context.isGroupMode,
    unreadCount,
    items: reminders.map(mapReminderRecordToItem),
  };
}

async function assertReminderOwnership(args: {
  reminderId: string;
  userId: string;
  householdId: string;
}) {
  const reminder = await prisma.userReminder.findFirst({
    where: {
      id: args.reminderId,
      userId: args.userId,
      householdId: args.householdId,
    },
    select: {
      id: true,
    },
  });

  if (!reminder) {
    throw new Error("Reminder not found.");
  }
}

export async function markReminderRead(args: {
  reminderId: string;
  userId: string;
  householdId: string;
}) {
  await assertReminderOwnership(args);

  await prisma.userReminder.update({
    where: {
      id: args.reminderId,
    },
    data: {
      readAt: new Date(),
    },
  });
}

export async function dismissReminder(args: {
  reminderId: string;
  userId: string;
  householdId: string;
}) {
  await assertReminderOwnership(args);

  await prisma.userReminder.update({
    where: {
      id: args.reminderId,
    },
    data: {
      isActive: false,
      dismissedAt: new Date(),
    },
  });
}
