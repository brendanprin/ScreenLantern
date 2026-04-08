import {
  HouseholdActivityType,
  MediaType,
  Prisma,
  SharedWatchlistScope,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { formatList } from "@/lib/utils";
import type {
  HouseholdActivityItem,
  SharedWatchlistScopeKey,
  TitleDetails,
  TitleSummary,
} from "@/lib/types";

type ActivityDbClient = Prisma.TransactionClient;


function toMediaTypeKey(mediaType: MediaType) {
  return mediaType === "MOVIE" ? "movie" : "tv";
}

function formatWhen(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function buildSharedSaveActivityCopy(args: {
  actorName: string;
  title: string;
  scope: SharedWatchlistScopeKey;
  contextLabel: string;
  active: boolean;
}) {
  const scopeLabel =
    args.scope === "GROUP" ? args.contextLabel : "the household";

  return {
    type: args.active
      ? HouseholdActivityType.SHARED_SAVE_ADDED
      : HouseholdActivityType.SHARED_SAVE_REMOVED,
    summary: args.active
      ? `${args.actorName} saved ${args.title} for ${scopeLabel}`
      : `${args.actorName} removed ${args.title} from ${scopeLabel}`,
    detail:
      args.scope === "GROUP"
        ? args.active
          ? `Shared planning pick for ${args.contextLabel}.`
          : `Removed from the shared watchlist for ${args.contextLabel}.`
        : args.active
          ? "Shared planning pick for the household."
          : "Removed from the household shared watchlist.",
  };
}

export function buildGroupWatchActivityCopy(args: {
  title: string;
  participantNames: string[];
  contextLabel: string;
  actorName: string;
}) {
  const participantLabel = formatList(args.participantNames);
  const actorDetail =
    args.participantNames.includes(args.actorName)
      ? null
      : `Marked by ${args.actorName}.`;

  return {
    type: HouseholdActivityType.GROUP_WATCH_RECORDED,
    summary: `${participantLabel} watched ${args.title} together`,
    detail: actorDetail ?? `Recorded for ${args.contextLabel}.`,
  };
}

export function buildInviteCreatedActivityCopy(args: {
  actorName: string;
  expiresAt: Date;
}) {
  return {
    type: HouseholdActivityType.INVITE_CREATED,
    summary: `${args.actorName} created a household invite`,
    detail: `A new join link is active until ${formatWhen(args.expiresAt)}.`,
  };
}

export function buildInviteRevokedActivityCopy(args: {
  actorName: string;
  inviteCode: string;
}) {
  return {
    type: HouseholdActivityType.INVITE_REVOKED,
    summary: `${args.actorName} revoked an invite`,
    detail: `Invite code ${args.inviteCode} is no longer active.`,
  };
}

export function buildInviteRedeemedActivityCopy(args: {
  actorName: string;
}) {
  return {
    type: HouseholdActivityType.INVITE_REDEEMED,
    summary: `${args.actorName} joined the household`,
    detail: "Joined with a household invite.",
  };
}

export function buildOwnershipTransferredActivityCopy(args: {
  fromName: string;
  toName: string;
}) {
  return {
    type: HouseholdActivityType.OWNERSHIP_TRANSFERRED,
    summary: `Ownership transferred from ${args.fromName} to ${args.toName}`,
    detail: `${args.toName} is now the household owner.`,
  };
}

export function buildMemberRemovedActivityCopy(args: {
  actorName: string;
  removedName: string;
}) {
  return {
    type: HouseholdActivityType.MEMBER_REMOVED,
    summary: `${args.actorName} removed ${args.removedName} from the household`,
    detail: `${args.removedName} was moved into a new solo household.`,
  };
}

async function createHouseholdActivity(args: {
  tx: ActivityDbClient;
  householdId: string;
  actorUserId?: string | null;
  titleCacheId?: string | null;
  type: HouseholdActivityType;
  contextLabel?: string | null;
  summary: string;
  detail?: string | null;
  metadataJson?: Prisma.InputJsonValue;
}) {
  return args.tx.householdActivity.create({
    data: {
      householdId: args.householdId,
      actorUserId: args.actorUserId ?? null,
      titleCacheId: args.titleCacheId ?? null,
      type: args.type,
      contextLabel: args.contextLabel ?? null,
      summary: args.summary,
      detail: args.detail ?? null,
      metadataJson: args.metadataJson,
    },
  });
}

export async function recordSharedWatchlistActivity(args: {
  tx: ActivityDbClient;
  householdId: string;
  actorUserId: string;
  actorName: string;
  title: { id: string; title: string };
  scope: SharedWatchlistScopeKey;
  contextLabel: string;
  active: boolean;
}) {
  const copy = buildSharedSaveActivityCopy({
    actorName: args.actorName,
    title: args.title.title,
    scope: args.scope,
    contextLabel: args.contextLabel,
    active: args.active,
  });

  return createHouseholdActivity({
    tx: args.tx,
    householdId: args.householdId,
    actorUserId: args.actorUserId,
    titleCacheId: args.title.id,
    type: copy.type,
    contextLabel: args.contextLabel,
    summary: copy.summary,
    detail: copy.detail,
    metadataJson: {
      scope: args.scope,
      active: args.active,
    },
  });
}

export async function recordGroupWatchActivity(args: {
  tx: ActivityDbClient;
  householdId: string;
  actorUserId: string;
  actorName: string;
  title: { id: string; title: string };
  participantNames: string[];
  contextLabel: string;
}) {
  const copy = buildGroupWatchActivityCopy({
    title: args.title.title,
    participantNames: args.participantNames,
    contextLabel: args.contextLabel,
    actorName: args.actorName,
  });

  return createHouseholdActivity({
    tx: args.tx,
    householdId: args.householdId,
    actorUserId: args.actorUserId,
    titleCacheId: args.title.id,
    type: copy.type,
    contextLabel: args.contextLabel,
    summary: copy.summary,
    detail: copy.detail,
    metadataJson: {
      participantNames: args.participantNames,
    },
  });
}

export async function recordInviteCreatedActivity(args: {
  tx: ActivityDbClient;
  householdId: string;
  actorUserId: string;
  actorName: string;
  expiresAt: Date;
  inviteCode: string;
}) {
  const copy = buildInviteCreatedActivityCopy({
    actorName: args.actorName,
    expiresAt: args.expiresAt,
  });

  return createHouseholdActivity({
    tx: args.tx,
    householdId: args.householdId,
    actorUserId: args.actorUserId,
    type: copy.type,
    summary: copy.summary,
    detail: copy.detail,
    metadataJson: {
      inviteCode: args.inviteCode,
    },
  });
}

export async function recordInviteRevokedActivity(args: {
  tx: ActivityDbClient;
  householdId: string;
  actorUserId: string;
  actorName: string;
  inviteCode: string;
}) {
  const copy = buildInviteRevokedActivityCopy({
    actorName: args.actorName,
    inviteCode: args.inviteCode,
  });

  return createHouseholdActivity({
    tx: args.tx,
    householdId: args.householdId,
    actorUserId: args.actorUserId,
    type: copy.type,
    summary: copy.summary,
    detail: copy.detail,
    metadataJson: {
      inviteCode: args.inviteCode,
    },
  });
}

export async function recordInviteRedeemedActivity(args: {
  tx: ActivityDbClient;
  householdId: string;
  actorUserId: string;
  actorName: string;
}) {
  const copy = buildInviteRedeemedActivityCopy({
    actorName: args.actorName,
  });

  return createHouseholdActivity({
    tx: args.tx,
    householdId: args.householdId,
    actorUserId: args.actorUserId,
    type: copy.type,
    summary: copy.summary,
    detail: copy.detail,
  });
}

export async function recordOwnershipTransferredActivity(args: {
  tx: ActivityDbClient;
  householdId: string;
  actorUserId: string;
  fromName: string;
  toName: string;
  targetUserId: string;
}) {
  const copy = buildOwnershipTransferredActivityCopy({
    fromName: args.fromName,
    toName: args.toName,
  });

  return createHouseholdActivity({
    tx: args.tx,
    householdId: args.householdId,
    actorUserId: args.actorUserId,
    type: copy.type,
    summary: copy.summary,
    detail: copy.detail,
    metadataJson: {
      targetUserId: args.targetUserId,
      fromName: args.fromName,
      toName: args.toName,
    },
  });
}

export async function recordMemberRemovedActivity(args: {
  tx: ActivityDbClient;
  householdId: string;
  actorUserId: string;
  actorName: string;
  removedUserId: string;
  removedName: string;
}) {
  const copy = buildMemberRemovedActivityCopy({
    actorName: args.actorName,
    removedName: args.removedName,
  });

  return createHouseholdActivity({
    tx: args.tx,
    householdId: args.householdId,
    actorUserId: args.actorUserId,
    type: copy.type,
    summary: copy.summary,
    detail: copy.detail,
    metadataJson: {
      removedUserId: args.removedUserId,
      removedName: args.removedName,
    },
  });
}

async function assertHouseholdAccess(userId: string, householdId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      householdId: true,
    },
  });

  if (!user || user.householdId !== householdId) {
    throw new Error("You do not have access to this household activity.");
  }
}

const ACTIVITY_RETENTION_DAYS = 90;

export async function getHouseholdActivityFeed(args: {
  userId: string;
  householdId: string;
  limit?: number;
}): Promise<HouseholdActivityItem[]> {
  await assertHouseholdAccess(args.userId, args.householdId);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ACTIVITY_RETENTION_DAYS);
  await prisma.householdActivity.deleteMany({
    where: { householdId: args.householdId, createdAt: { lt: cutoff } },
  });

  const activities = await prisma.householdActivity.findMany({
    where: {
      householdId: args.householdId,
    },
    include: {
      actor: {
        select: {
          name: true,
        },
      },
      title: {
        select: {
          tmdbId: true,
          mediaType: true,
          title: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: args.limit ?? 50,
  });

  return activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    summary: activity.summary,
    detail: activity.detail,
    contextLabel: activity.contextLabel,
    createdAt: activity.createdAt.toISOString(),
    actorName: activity.actor?.name ?? null,
    title: activity.title
      ? {
          title: activity.title.title,
          mediaType: toMediaTypeKey(activity.title.mediaType),
          href: `/app/title/${toMediaTypeKey(activity.title.mediaType)}/${activity.title.tmdbId}`,
        }
      : null,
  }));
}

export const HOUSEHOLD_ACTIVITY_LABELS: Record<HouseholdActivityType, string> = {
  SHARED_SAVE_ADDED: "Shared save",
  SHARED_SAVE_REMOVED: "Shared cleanup",
  GROUP_WATCH_RECORDED: "Watched together",
  INVITE_CREATED: "Invite",
  INVITE_REVOKED: "Invite",
  INVITE_REDEEMED: "New member",
  OWNERSHIP_TRANSFERRED: "Governance",
  MEMBER_REMOVED: "Governance",
};
