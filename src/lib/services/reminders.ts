import {
  RecommendationMode,
  ReminderAggressiveness,
  ReminderCategory,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeSelectedUserIds } from "@/lib/utils";
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
  ReminderAggressivenessKey,
  ReminderCategoryKey,
  ReminderInboxResult,
  ReminderItem,
  ReminderPreferences,
} from "@/lib/types";
import { reminderPreferencesSchema } from "@/lib/validations/reminder-preferences";

const MAX_AVAILABLE_NOW_REMINDERS = 4;
export const DISMISSED_REMINDER_REAPPEAR_COOLDOWN_DAYS = 14;

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  enableAvailableNow: true,
  enableWatchlistResurface: true,
  enableGroupWatchCandidate: true,
  enableSoloReminders: true,
  enableGroupReminders: true,
  aggressiveness: "BALANCED",
  allowDismissedReappear: false,
};


function toReminderAggressivenessKey(
  value: ReminderAggressiveness,
): ReminderAggressivenessKey {
  return value;
}

function toReminderAggressivenessEnum(
  value: ReminderAggressivenessKey,
): ReminderAggressiveness {
  return value as ReminderAggressiveness;
}

function mapReminderPreferencesRecord(
  record:
    | {
        enableAvailableNow: boolean;
        enableWatchlistResurface: boolean;
        enableGroupWatchCandidate: boolean;
        enableSoloReminders: boolean;
        enableGroupReminders: boolean;
        aggressiveness: ReminderAggressiveness;
        allowDismissedReappear: boolean;
      }
    | null
    | undefined,
): ReminderPreferences {
  if (!record) {
    return { ...DEFAULT_REMINDER_PREFERENCES };
  }

  return {
    enableAvailableNow: record.enableAvailableNow,
    enableWatchlistResurface: record.enableWatchlistResurface,
    enableGroupWatchCandidate: record.enableGroupWatchCandidate,
    enableSoloReminders: record.enableSoloReminders,
    enableGroupReminders: record.enableGroupReminders,
    aggressiveness: toReminderAggressivenessKey(record.aggressiveness),
    allowDismissedReappear: record.allowDismissedReappear,
  };
}

export async function getReminderPreferences(args: {
  userId: string;
  householdId: string;
}): Promise<ReminderPreferences> {
  const record = await prisma.userReminderPreference.findFirst({
    where: {
      userId: args.userId,
      householdId: args.householdId,
    },
  });

  return mapReminderPreferencesRecord(record);
}

export async function updateReminderPreferences(args: {
  userId: string;
  householdId: string;
  preferences: ReminderPreferences;
}) {
  const parsed = reminderPreferencesSchema.safeParse(args.preferences);

  if (!parsed.success) {
    throw new Error("Invalid reminder preferences.");
  }

  return prisma.userReminderPreference.upsert({
    where: {
      userId: args.userId,
    },
    update: {
      householdId: args.householdId,
      enableAvailableNow: parsed.data.enableAvailableNow,
      enableWatchlistResurface: parsed.data.enableWatchlistResurface,
      enableGroupWatchCandidate: parsed.data.enableGroupWatchCandidate,
      enableSoloReminders: parsed.data.enableSoloReminders,
      enableGroupReminders: parsed.data.enableGroupReminders,
      aggressiveness: toReminderAggressivenessEnum(parsed.data.aggressiveness),
      allowDismissedReappear: parsed.data.allowDismissedReappear,
    },
    create: {
      userId: args.userId,
      householdId: args.householdId,
      enableAvailableNow: parsed.data.enableAvailableNow,
      enableWatchlistResurface: parsed.data.enableWatchlistResurface,
      enableGroupWatchCandidate: parsed.data.enableGroupWatchCandidate,
      enableSoloReminders: parsed.data.enableSoloReminders,
      enableGroupReminders: parsed.data.enableGroupReminders,
      aggressiveness: toReminderAggressivenessEnum(parsed.data.aggressiveness),
      allowDismissedReappear: parsed.data.allowDismissedReappear,
    },
  });
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

export function getSoftReminderLimit(
  aggressiveness: ReminderAggressivenessKey,
) {
  if (aggressiveness === "LIGHT") {
    return 1;
  }

  if (aggressiveness === "PROACTIVE") {
    return 5;
  }

  return 3;
}

function reminderCategoryPriority(candidate: WatchlistResurfacingCandidate) {
  return candidate.laneId === "available_now" ? 2 : 1;
}

export function dedupeReminderCandidates(
  candidates: WatchlistResurfacingCandidate[],
) {
  const byTitleCacheId = new Map<string, WatchlistResurfacingCandidate>();

  for (const candidate of candidates) {
    const existing = byTitleCacheId.get(candidate.titleCacheId);

    if (!existing) {
      byTitleCacheId.set(candidate.titleCacheId, candidate);
      continue;
    }

    const candidatePriority = reminderCategoryPriority(candidate);
    const existingPriority = reminderCategoryPriority(existing);

    if (candidatePriority > existingPriority) {
      byTitleCacheId.set(candidate.titleCacheId, candidate);
      continue;
    }

    if (
      candidatePriority === existingPriority &&
      candidate.item.score > existing.item.score
    ) {
      byTitleCacheId.set(candidate.titleCacheId, candidate);
    }
  }

  return [...byTitleCacheId.values()].sort((left, right) => {
    const rightPriority = reminderCategoryPriority(right);
    const leftPriority = reminderCategoryPriority(left);

    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    if (right.item.score !== left.item.score) {
      return right.item.score - left.item.score;
    }

    return (
      new Date(right.latestUpdatedAt).getTime() -
      new Date(left.latestUpdatedAt).getTime()
    );
  });
}

function isReminderCategoryEnabled(
  category: ReminderCategory,
  preferences: ReminderPreferences,
) {
  if (category === ReminderCategory.AVAILABLE_NOW) {
    return preferences.enableAvailableNow;
  }

  if (category === ReminderCategory.GROUP_WATCH_CANDIDATE) {
    return preferences.enableGroupWatchCandidate;
  }

  return preferences.enableWatchlistResurface;
}

export function selectReminderCandidatesForPreferences(args: {
  candidates: WatchlistResurfacingCandidate[];
  preferences: ReminderPreferences;
  mode: RecommendationModeKey;
}) {
  if (
    (args.mode === "GROUP" && !args.preferences.enableGroupReminders) ||
    (args.mode === "SOLO" && !args.preferences.enableSoloReminders)
  ) {
    return [] as WatchlistResurfacingCandidate[];
  }

  const isGroupMode = args.mode === "GROUP";
  const deduped = dedupeReminderCandidates(args.candidates);
  const filtered = deduped.filter((candidate) =>
    isReminderCategoryEnabled(
      mapReminderCategory({
        laneId: candidate.laneId,
        isGroupMode,
      }),
      args.preferences,
    ),
  );
  const softLimit = getSoftReminderLimit(args.preferences.aggressiveness);
  const availableNow = filtered
    .filter((candidate) => candidate.laneId === "available_now")
    .slice(0, MAX_AVAILABLE_NOW_REMINDERS);
  const softerResurfacing = filtered
    .filter((candidate) => candidate.laneId !== "available_now")
    .slice(0, softLimit);

  return [...availableNow, ...softerResurfacing];
}

export function shouldReactivateDismissedReminder(args: {
  dismissedAt?: Date | null;
  allowDismissedReappear: boolean;
  now?: Date;
}) {
  if (!args.dismissedAt || !args.allowDismissedReappear) {
    return false;
  }

  const now = args.now ?? new Date();
  const availableAt = new Date(args.dismissedAt);
  availableAt.setDate(
    availableAt.getDate() + DISMISSED_REMINDER_REAPPEAR_COOLDOWN_DAYS,
  );

  return now.getTime() >= availableAt.getTime();
}

function buildReminderTuningNote(args: {
  preferences: ReminderPreferences;
  mode: RecommendationModeKey;
  hasItems: boolean;
}) {
  if (args.mode === "GROUP" && !args.preferences.enableGroupReminders) {
    return "Group reminders are turned off in Settings.";
  }

  if (args.mode === "SOLO" && !args.preferences.enableSoloReminders) {
    return "Solo reminders are turned off in Settings.";
  }

  const relevantCategories =
    args.mode === "GROUP"
      ? [
          args.preferences.enableAvailableNow,
          args.preferences.enableGroupWatchCandidate,
        ]
      : [
          args.preferences.enableAvailableNow,
          args.preferences.enableWatchlistResurface,
        ];

  if (relevantCategories.every((value) => !value)) {
    return "The reminder categories for this view are turned off in Settings.";
  }

  if (!args.hasItems && relevantCategories.some((value) => !value)) {
    return "This inbox is quieter because some reminder categories are turned off in Settings.";
  }

  if (args.preferences.aggressiveness === "LIGHT") {
    return "Reminder tuning is set to Light, so softer watchlist nudges stay limited.";
  }

  return null;
}

function hasMaterialReminderChange(args: {
  existingSummary: string;
  existingDetail: string | null;
  nextSummary: string;
  nextDetail: string | null;
}) {
  return (
    args.existingSummary !== args.nextSummary ||
    args.existingDetail !== args.nextDetail
  );
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
  preferences: ReminderPreferences;
}) {
  const resurfacing = await getWatchlistResurfacingSnapshot({
    userIds: args.selectedUserIds,
    householdId: args.householdId,
    maxPerLane: 8,
  });
  const contextLabel = buildReminderContextLabel(
    args.activeNames,
    args.isGroupMode,
  );
  const drafts = selectReminderCandidatesForPreferences({
    candidates: resurfacing.candidates,
    preferences: args.preferences,
    mode: args.mode,
  }).map((candidate) =>
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
      summary: true,
      detail: true,
      readAt: true,
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
        const shouldReactivate = shouldReactivateDismissedReminder({
          dismissedAt: existingReminder.dismissedAt,
          allowDismissedReappear: args.preferences.allowDismissedReappear,
        });
        const materiallyChanged = hasMaterialReminderChange({
          existingSummary: existingReminder.summary,
          existingDetail: existingReminder.detail,
          nextSummary: draft.summary,
          nextDetail: draft.detail,
        });
        const data: Prisma.UserReminderUncheckedUpdateInput = {
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
          explanationJson:
            draft.explanations as unknown as Prisma.InputJsonValue,
          isActive: shouldReactivate ? true : existingReminder.dismissedAt ? false : true,
        };

        if (shouldReactivate) {
          data.dismissedAt = null;
          data.readAt = null;
        } else if (existingReminder.readAt && materiallyChanged) {
          data.readAt = null;
        }

        await tx.userReminder.update({
          where: {
            id: existingReminder.id,
          },
          data,
        });
        continue;
      }

      await tx.userReminder.upsert({
        where: {
          userId_contextKey_category_titleCacheId: {
            userId: args.userId,
            contextKey,
            category: draft.category,
            titleCacheId: draft.titleCacheId,
          },
        },
        update: {
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
          explanationJson:
            draft.explanations as unknown as Prisma.InputJsonValue,
          isActive: true,
        },
        create: {
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
  const title = mapTitleCacheToSummary(reminder.title);

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
  const preferences = await getReminderPreferences({
    userId: args.userId,
    householdId: args.householdId,
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
      preferences,
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
      tuningNote: buildReminderTuningNote({
        preferences,
        mode: context.mode,
        hasItems: unreadCount > 0,
      }),
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
    tuningNote: buildReminderTuningNote({
      preferences,
      mode: context.mode,
      hasItems: reminders.length > 0,
    }),
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
