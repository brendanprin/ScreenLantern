import { InteractionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildParticipantKey } from "@/lib/services/group-watch-sessions";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";
import {
  getUserTasteProfile,
  scoreRecommendationCandidate,
} from "@/lib/services/recommendations";
import {
  buildSharedWatchlistContextKey,
} from "@/lib/services/shared-watchlist";
import type {
  RecommendationExplanation,
  TitleDetails,
  TitleFitMemberSignal,
  TitleFitSummary,
  TitleSummary,
} from "@/lib/types";

const POSITIVE_EXPLANATION_CATEGORIES = new Set([
  "genre_overlap",
  "group_overlap",
  "provider_match",
  "runtime_fit",
  "media_fit",
]);

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function uniqueNames(items: string[]) {
  return [...new Set(items.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function positiveSignalCount(explanations: RecommendationExplanation[]) {
  return explanations.filter((explanation) =>
    POSITIVE_EXPLANATION_CATEGORIES.has(explanation.category),
  ).length;
}

function toneRank(tone: TitleFitMemberSignal["tone"]) {
  switch (tone) {
    case "strong":
      return 0;
    case "good":
      return 1;
    case "conflict":
      return 2;
    default:
      return 3;
  }
}

interface ComputedMemberFitSignal extends TitleFitMemberSignal {
  score: number;
  hasDirectLike: boolean;
  hasDirectDislike: boolean;
  hasHidden: boolean;
  hasWatched: boolean;
  hasWatchlist: boolean;
}

export function buildMemberFitSignal(args: {
  id: string;
  name: string;
  isActiveContextMember: boolean;
  interactionTypes: InteractionType[];
  watchedViaGroup: boolean;
  savedForGroup: boolean;
  savedForHousehold: boolean;
  score: number;
  explanations: RecommendationExplanation[];
}): ComputedMemberFitSignal {
  const interactionTypes = new Set(args.interactionTypes);
  const hasHidden = interactionTypes.has(InteractionType.HIDE);
  const hasDirectDislike = interactionTypes.has(InteractionType.DISLIKE);
  const hasDirectLike = interactionTypes.has(InteractionType.LIKE);
  const hasWatchlist = interactionTypes.has(InteractionType.WATCHLIST);
  const hasWatched =
    interactionTypes.has(InteractionType.WATCHED) || args.watchedViaGroup;
  const positiveSignals = positiveSignalCount(args.explanations);

  let tone: ComputedMemberFitSignal["tone"] = "neutral";
  let label = "Neutral so far";
  let detail = "There is not a strong positive or negative signal for this member yet.";

  if (hasHidden) {
    tone = "conflict";
    label = "Not interested";
    detail =
      "This title was hidden or strongly deprioritized for this member before.";
  } else if (hasDirectDislike) {
    tone = "conflict";
    label = "Potential conflict";
    detail =
      "This member has a direct negative signal here, so it is not a safe assumption.";
  } else if (hasDirectLike) {
    tone = "strong";
    label = "Already likes it";
    detail = "This title already has a direct positive signal from this member.";
  } else if (positiveSignals >= 2 || args.score >= 95) {
    tone = "strong";
    label = "Likes similar picks";
    detail =
      "Genre, format, runtime, or provider signals line up unusually well for this member.";
  } else if (hasWatchlist) {
    tone = "good";
    label = "Saved it personally";
    detail =
      "This member already put it on their own watchlist, which is a useful planning signal.";
  } else if (positiveSignals >= 1 || args.score >= 72) {
    tone = "good";
    label = "Could work well";
    detail =
      "The title fits part of this member's usual pattern even without a direct save or like.";
  } else if (hasWatched) {
    tone = "neutral";
    label = "Seen it already";
    detail = "This looks more like rewatch territory than a fresh discovery for this member.";
  }

  const chips = [
    hasDirectLike ? "Liked it" : null,
    hasDirectDislike ? "Disliked it" : null,
    hasHidden ? "Hidden" : null,
    hasWatched ? "Watched" : null,
    hasWatchlist ? "Saved personally" : null,
    args.savedForGroup ? "Saved for group" : null,
    args.savedForHousehold ? "Saved for household" : null,
    !hasDirectLike &&
    !hasDirectDislike &&
    !hasHidden &&
    !hasWatchlist &&
    tone === "strong"
      ? "Likes similar picks"
      : null,
  ].filter((chip): chip is string => Boolean(chip));

  return {
    id: args.id,
    name: args.name,
    isActiveContextMember: args.isActiveContextMember,
    tone,
    label,
    detail,
    chips: chips.slice(0, 4),
    score: args.score,
    hasDirectLike,
    hasDirectDislike,
    hasHidden,
    hasWatched,
    hasWatchlist,
  };
}

function bestFitNames(memberSignals: ComputedMemberFitSignal[]) {
  const strong = memberSignals
    .filter((member) => member.tone === "strong")
    .map((member) => member.name);

  if (strong.length > 0) {
    return uniqueNames(strong);
  }

  return uniqueNames(
    memberSignals
      .filter((member) => member.tone === "good")
      .map((member) => member.name),
  );
}

export function summarizeTitleFit(args: {
  isGroupMode: boolean;
  contextLabel: string;
  memberSignals: ComputedMemberFitSignal[];
  groupSavedByNames: string[];
  householdSavedByNames: string[];
  isWatchedByCurrentGroup: boolean;
}): Omit<TitleFitSummary, "members"> {
  const selectedMembers = args.memberSignals.filter((member) => member.isActiveContextMember);
  const positiveMembers = selectedMembers.filter(
    (member) => member.tone === "strong" || member.tone === "good",
  );
  const strongMembers = selectedMembers.filter((member) => member.tone === "strong");
  const conflictMembers = selectedMembers.filter((member) => member.tone === "conflict");
  const bestNames = bestFitNames(args.memberSignals);
  const bestForLabel =
    bestNames.length > 0 ? `Best for ${formatList(bestNames.slice(0, 3))}` : null;
  const outsideContextBestNames = bestFitNames(
    args.memberSignals.filter((member) => !member.isActiveContextMember),
  );
  const sharedSaveNote =
    args.groupSavedByNames.length > 0
      ? `Saved for ${args.contextLabel} by ${formatList(args.groupSavedByNames)}.`
      : args.householdSavedByNames.length > 0
        ? `Saved by ${formatList(args.householdSavedByNames)} for the household.`
        : null;
  const outsideContextNote =
    outsideContextBestNames.length > 0
      ? `Outside this view, it looks strongest for ${formatList(
          outsideContextBestNames.slice(0, 3),
        )}.`
      : null;
  const supportNote = sharedSaveNote ?? outsideContextNote ?? null;

  if (!args.isGroupMode) {
    const activeMember = selectedMembers[0];

    if (!activeMember) {
      return {
        tone: "solo_mixed",
        badge: "Fit summary",
        headline: "Possible fit",
        detail:
          "ScreenLantern could not resolve a solo profile cleanly, so this title is staying neutral.",
        supportNote,
        bestForLabel,
        contextLabel: args.contextLabel,
        isGroupMode: false,
        isWatchedByCurrentGroup: false,
      };
    }

    if (activeMember.tone === "conflict") {
      return {
        tone: "solo_conflict",
        badge: "Low fit",
        headline: `Likely miss for ${activeMember.name}`,
        detail:
          "There is already a clear negative signal here, so this is not a strong solo pick right now.",
        supportNote,
        bestForLabel,
        contextLabel: args.contextLabel,
        isGroupMode: false,
        isWatchedByCurrentGroup: false,
      };
    }

    if (activeMember.tone === "strong") {
      return {
        tone: "solo_strong",
        badge: "Best fit",
        headline: `Best fit for ${activeMember.name}`,
        detail:
          "The active profile shows unusually strong alignment here, so this is closer to a confident solo pick than a maybe.",
        supportNote,
        bestForLabel,
        contextLabel: args.contextLabel,
        isGroupMode: false,
        isWatchedByCurrentGroup: false,
      };
    }

    if (activeMember.tone === "good") {
      return {
        tone: "solo_good",
        badge: "Good fit",
        headline: `Good fit for ${activeMember.name}`,
        detail:
          "There is enough positive signal here to keep this in active consideration without overselling it.",
        supportNote,
        bestForLabel,
        contextLabel: args.contextLabel,
        isGroupMode: false,
        isWatchedByCurrentGroup: false,
      };
    }

    if (sharedSaveNote) {
      return {
        tone: "household_planning",
        badge: "Planning item",
        headline: `More of a household planning item for ${activeMember.name}`,
        detail:
          "This title matters in household planning, but the current solo profile does not show a strong pull yet.",
        supportNote,
        bestForLabel,
        contextLabel: args.contextLabel,
        isGroupMode: false,
        isWatchedByCurrentGroup: false,
      };
    }

    return {
      tone: "solo_mixed",
      badge: "Possible fit",
      headline: `Possible fit for ${activeMember.name}`,
      detail:
        "There is not enough signal yet to call this a standout solo pick, but it is still in range.",
      supportNote,
      bestForLabel,
      contextLabel: args.contextLabel,
      isGroupMode: false,
      isWatchedByCurrentGroup: false,
    };
  }

  if (args.isWatchedByCurrentGroup) {
    return {
      tone: "group_rewatch",
      badge: "Watched together",
      headline: `${args.contextLabel} already watched this together`,
      detail:
        "It may still work as a rewatch, but ScreenLantern should treat it as familiar ground instead of a fresh shared pick.",
      supportNote,
      bestForLabel,
      contextLabel: args.contextLabel,
      isGroupMode: true,
      isWatchedByCurrentGroup: true,
    };
  }

  if (conflictMembers.length > 0 && positiveMembers.length > 0) {
    return {
      tone: "group_mixed",
      badge: "Mixed fit",
      headline: `Mixed fit for ${args.contextLabel}`,
      detail: `${formatList(
        positiveMembers.map((member) => member.name),
      )} show the stronger pull here, but ${formatList(
        conflictMembers.map((member) => member.name),
      )} may bounce off it.`,
      supportNote,
      bestForLabel,
      contextLabel: args.contextLabel,
      isGroupMode: true,
      isWatchedByCurrentGroup: false,
    };
  }

  if (conflictMembers.length > 0) {
    return {
      tone: "group_conflict",
      badge: "Potential conflict",
      headline: `Potential conflict for ${args.contextLabel}`,
      detail:
        "At least one selected member already shows a clear negative signal here, so this is not a clean room pick.",
      supportNote,
      bestForLabel,
      contextLabel: args.contextLabel,
      isGroupMode: true,
      isWatchedByCurrentGroup: false,
    };
  }

  if (strongMembers.length === selectedMembers.length && selectedMembers.length > 1) {
    return {
      tone: "group_strong_overlap",
      badge: "Strong shared fit",
      headline: `Good shared fit for ${args.contextLabel}`,
      detail:
        "Each selected member shows positive signals here, so this looks like real overlap instead of a one-sided compromise.",
      supportNote,
      bestForLabel,
      contextLabel: args.contextLabel,
      isGroupMode: true,
      isWatchedByCurrentGroup: false,
    };
  }

  if (positiveMembers.length === selectedMembers.length && selectedMembers.length > 1) {
    return {
      tone: "group_strong_overlap",
      badge: "Good shared fit",
      headline: `Good shared fit for ${args.contextLabel}`,
      detail:
        "Nobody in the active group throws up a hard conflict, and the title lines up with more than one member's pattern.",
      supportNote,
      bestForLabel,
      contextLabel: args.contextLabel,
      isGroupMode: true,
      isWatchedByCurrentGroup: false,
    };
  }

  if (positiveMembers.length > 0) {
    return {
      tone: "group_safe_compromise",
      badge: "Safe compromise",
      headline: `Safe compromise for ${args.contextLabel}`,
      detail:
        "There is enough positive signal to keep this room-friendly, even if it looks stronger for some members than others.",
      supportNote,
      bestForLabel,
      contextLabel: args.contextLabel,
      isGroupMode: true,
      isWatchedByCurrentGroup: false,
    };
  }

  if (sharedSaveNote) {
    return {
      tone: "household_planning",
      badge: "Planning item",
      headline: `More of a planning item for ${args.contextLabel}`,
      detail:
        "This title is in the shared planning orbit, but the current group does not show much overlap yet.",
      supportNote,
      bestForLabel,
      contextLabel: args.contextLabel,
      isGroupMode: true,
      isWatchedByCurrentGroup: false,
    };
  }

  return {
    tone: "group_mixed",
    badge: "Mixed fit",
    headline: `Mixed fit for ${args.contextLabel}`,
    detail:
      "This title does not yet show clear overlap across the active group, so it feels more tentative than trusted.",
    supportNote,
    bestForLabel,
    contextLabel: args.contextLabel,
    isGroupMode: true,
    isWatchedByCurrentGroup: false,
  };
}

export async function getTitleFitSummary(args: {
  userId: string;
  householdId: string;
  title: TitleSummary | TitleDetails;
  titleCacheId: string;
}): Promise<TitleFitSummary> {
  const bootstrap = await getRecommendationContextBootstrap({
    userId: args.userId,
    householdId: args.householdId,
  });
  const householdMemberIds = bootstrap.householdMembers.map((member) => member.id);
  const groupContextKey = bootstrap.context.isGroupMode
    ? buildSharedWatchlistContextKey({
        scope: "GROUP",
        householdId: args.householdId,
        selectedUserIds: bootstrap.context.selectedUserIds,
      })
    : null;
  const householdContextKey = buildSharedWatchlistContextKey({
    scope: "HOUSEHOLD",
    householdId: args.householdId,
  });

  const [profiles, directInteractions, sharedEntries, watchSessions] = await Promise.all([
    Promise.all(
      bootstrap.householdMembers.map(async (member) => [
        member.id,
        await getUserTasteProfile(member.id),
      ] as const),
    ),
    prisma.userTitleInteraction.findMany({
      where: {
        titleCacheId: args.titleCacheId,
        userId: {
          in: householdMemberIds,
        },
      },
      select: {
        userId: true,
        interactionType: true,
      },
    }),
    prisma.sharedWatchlistEntry.findMany({
      where: {
        householdId: args.householdId,
        titleCacheId: args.titleCacheId,
        contextKey: {
          in: [householdContextKey, groupContextKey].filter(
            (value): value is string => Boolean(value),
          ),
        },
      },
      select: {
        savedById: true,
        contextKey: true,
      },
    }),
    prisma.groupWatchSession.findMany({
      where: {
        householdId: args.householdId,
        titleCacheId: args.titleCacheId,
      },
      select: {
        participantKey: true,
        participantUserIds: true,
      },
    }),
  ]);

  const interactionsByUserId = new Map<string, InteractionType[]>();

  directInteractions.forEach((interaction) => {
    const existing = interactionsByUserId.get(interaction.userId) ?? [];
    interactionsByUserId.set(interaction.userId, [...existing, interaction.interactionType]);
  });

  const watchedByMemberIds = new Set<string>();

  watchSessions.forEach((session) => {
    session.participantUserIds.forEach((userId) => watchedByMemberIds.add(userId));
  });

  const currentGroupParticipantKey = bootstrap.context.isGroupMode
    ? buildParticipantKey(bootstrap.context.selectedUserIds)
    : null;
  const isWatchedByCurrentGroup = Boolean(
    currentGroupParticipantKey &&
      watchSessions.some((session) => session.participantKey === currentGroupParticipantKey),
  );

  const groupSavedByIds = new Set(
    sharedEntries
      .filter((entry) => entry.contextKey === groupContextKey)
      .map((entry) => entry.savedById),
  );
  const householdSavedByIds = new Set(
    sharedEntries
      .filter((entry) => entry.contextKey === householdContextKey)
      .map((entry) => entry.savedById),
  );
  const profileByUserId = new Map(profiles);

  const memberSignals = bootstrap.householdMembers
    .map((member) => {
      const profile = profileByUserId.get(member.id);
      const scored = profile
        ? scoreRecommendationCandidate(args.title, profile, {
            mode: "solo",
          })
        : {
            score: 0,
            explanations: [] as RecommendationExplanation[],
          };

      return buildMemberFitSignal({
        id: member.id,
        name: member.name,
        isActiveContextMember: bootstrap.context.selectedUserIds.includes(member.id),
        interactionTypes: interactionsByUserId.get(member.id) ?? [],
        watchedViaGroup: watchedByMemberIds.has(member.id),
        savedForGroup: groupSavedByIds.has(member.id),
        savedForHousehold: householdSavedByIds.has(member.id),
        score: scored.score,
        explanations: scored.explanations,
      });
    })
    .sort((left, right) => {
      if (left.isActiveContextMember !== right.isActiveContextMember) {
        return left.isActiveContextMember ? -1 : 1;
      }

      const leftToneRank = toneRank(left.tone);
      const rightToneRank = toneRank(right.tone);

      if (leftToneRank !== rightToneRank) {
        return leftToneRank - rightToneRank;
      }

      return left.name.localeCompare(right.name);
    });

  const summary = summarizeTitleFit({
    isGroupMode: bootstrap.context.isGroupMode,
    contextLabel: bootstrap.context.isGroupMode
      ? bootstrap.context.activeNames.join(" + ") || "this group"
      : bootstrap.context.activeNames[0] ?? "you",
    memberSignals,
    groupSavedByNames: uniqueNames(
      memberSignals
        .filter((member) => groupSavedByIds.has(member.id))
        .map((member) => member.name),
    ),
    householdSavedByNames: uniqueNames(
      memberSignals
        .filter((member) => householdSavedByIds.has(member.id))
        .map((member) => member.name),
    ),
    isWatchedByCurrentGroup,
  });

  return {
    ...summary,
    members: memberSignals.map((member) => ({
      id: member.id,
      name: member.name,
      isActiveContextMember: member.isActiveContextMember,
      tone: member.tone,
      label: member.label,
      detail: member.detail,
      chips: member.chips,
    })),
  };
}
