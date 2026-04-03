import { RecommendationMode } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  HouseholdMemberOption,
  PersistedRecommendationContext,
  RecommendationContextSource,
  RecommendationModeKey,
  SavedGroupOption,
} from "@/lib/types";

interface StoredRecommendationContextRecord {
  mode: RecommendationModeKey;
  selectedUserIds: string[];
  savedGroupId: string | null;
}

export interface RecommendationContextBootstrap {
  householdMembers: HouseholdMemberOption[];
  savedGroups: SavedGroupOption[];
  context: PersistedRecommendationContext;
}

function normalizeSelectedUserIds(userIds: string[]) {
  return [...new Set(userIds.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function buildActiveNames(
  selectedUserIds: string[],
  householdMembers: HouseholdMemberOption[],
) {
  return selectedUserIds
    .map((userId) => householdMembers.find((member) => member.id === userId)?.name)
    .filter((name): name is string => Boolean(name));
}

export function resolveRecommendationContextState(args: {
  viewerUserId: string;
  householdMembers: HouseholdMemberOption[];
  savedGroups: SavedGroupOption[];
  storedContext: StoredRecommendationContextRecord | null;
}): {
  context: PersistedRecommendationContext;
  wasNormalized: boolean;
} {
  const fallback: PersistedRecommendationContext = {
    mode: "SOLO",
    selectedUserIds: [args.viewerUserId],
    savedGroupId: null,
    source: "solo_profile",
    activeNames: buildActiveNames([args.viewerUserId], args.householdMembers),
    isGroupMode: false,
  };

  if (!args.storedContext) {
    return {
      context: fallback,
      wasNormalized: false,
    };
  }

  const validMemberIds = new Set(args.householdMembers.map((member) => member.id));

  if (args.storedContext.mode === "SOLO") {
    const soloUserId = args.storedContext.selectedUserIds.find((userId) =>
      validMemberIds.has(userId),
    );

    if (!soloUserId) {
      return {
        context: fallback,
        wasNormalized: true,
      };
    }

    return {
      context: {
        mode: "SOLO",
        selectedUserIds: [soloUserId],
        savedGroupId: null,
        source: "solo_profile",
        activeNames: buildActiveNames([soloUserId], args.householdMembers),
        isGroupMode: false,
      },
      wasNormalized:
        args.storedContext.selectedUserIds.length !== 1 ||
        args.storedContext.selectedUserIds[0] !== soloUserId ||
        Boolean(args.storedContext.savedGroupId),
    };
  }

  const savedGroupId = args.storedContext.savedGroupId;

  if (savedGroupId) {
    const group = args.savedGroups.find(
      (candidate) => candidate.id === savedGroupId,
    );

    if (!group) {
      return {
        context: fallback,
        wasNormalized: true,
      };
    }

    const groupUserIds = normalizeSelectedUserIds(
      group.userIds.filter((userId) => validMemberIds.has(userId)),
    );

    if (groupUserIds.length < 2) {
      return {
        context: fallback,
        wasNormalized: true,
      };
    }

    return {
      context: {
        mode: "GROUP",
        selectedUserIds: groupUserIds,
        savedGroupId: group.id,
        source: "saved_group",
        activeNames: buildActiveNames(groupUserIds, args.householdMembers),
        isGroupMode: true,
      },
      wasNormalized:
        args.storedContext.savedGroupId !== group.id ||
        groupUserIds.join("|") !==
          normalizeSelectedUserIds(args.storedContext.selectedUserIds).join("|"),
    };
  }

  const adHocUserIds = normalizeSelectedUserIds(
    args.storedContext.selectedUserIds.filter((userId) => validMemberIds.has(userId)),
  );

  if (adHocUserIds.length < 2) {
    return {
      context: fallback,
      wasNormalized: true,
    };
  }

  return {
    context: {
      mode: "GROUP",
      selectedUserIds: adHocUserIds,
      savedGroupId: null,
      source: "ad_hoc_group",
      activeNames: buildActiveNames(adHocUserIds, args.householdMembers),
      isGroupMode: true,
    },
    wasNormalized:
      args.storedContext.savedGroupId !== null ||
      adHocUserIds.join("|") !==
        normalizeSelectedUserIds(args.storedContext.selectedUserIds).join("|"),
  };
}

async function assertUserHouseholdAccess(userId: string, householdId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      householdId: true,
    },
  });

  if (!user || user.householdId !== householdId) {
    throw new Error("You do not have access to this recommendation context.");
  }

  return user;
}

async function getHouseholdContextOptions(householdId: string) {
  const household = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    include: {
      users: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
        },
      },
      groups: {
        orderBy: { name: "asc" },
        include: {
          members: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });

  return {
    householdMembers: household.users,
    savedGroups: household.groups.map((group) => ({
      id: group.id,
      name: group.name,
      userIds: group.members.map((member) => member.userId),
    })),
  };
}

export async function persistRecommendationContext(args: {
  userId: string;
  householdId: string;
  mode: RecommendationModeKey;
  selectedUserIds: string[];
  savedGroupId?: string | null;
}) {
  await assertUserHouseholdAccess(args.userId, args.householdId);
  const options = await getHouseholdContextOptions(args.householdId);
  const validMemberIds = new Set(options.householdMembers.map((member) => member.id));

  if (args.mode === "SOLO") {
    const soloUserIds = normalizeSelectedUserIds(
      args.selectedUserIds.filter((userId) => validMemberIds.has(userId)),
    );

    if (soloUserIds.length !== 1) {
      throw new Error("Solo context must target exactly one household member.");
    }

    const saved = await prisma.userRecommendationContext.upsert({
      where: {
        userId: args.userId,
      },
      update: {
        householdId: args.householdId,
        mode: RecommendationMode.SOLO,
        selectedUserIds: soloUserIds,
        savedGroupId: null,
      },
      create: {
        userId: args.userId,
        householdId: args.householdId,
        mode: RecommendationMode.SOLO,
        selectedUserIds: soloUserIds,
        savedGroupId: null,
      },
    });

    return resolveRecommendationContextState({
      viewerUserId: args.userId,
      householdMembers: options.householdMembers,
      savedGroups: options.savedGroups,
      storedContext: {
        mode: saved.mode,
        selectedUserIds: saved.selectedUserIds,
        savedGroupId: saved.savedGroupId,
      },
    }).context;
  }

  if (args.savedGroupId) {
    const group = options.savedGroups.find((candidate) => candidate.id === args.savedGroupId);

    if (!group) {
      throw new Error("Saved group not found in this household.");
    }

    const groupUserIds = normalizeSelectedUserIds(group.userIds);

    if (groupUserIds.length < 2) {
      throw new Error("Saved group must contain at least two members.");
    }

    const saved = await prisma.userRecommendationContext.upsert({
      where: {
        userId: args.userId,
      },
      update: {
        householdId: args.householdId,
        mode: RecommendationMode.GROUP,
        selectedUserIds: groupUserIds,
        savedGroupId: group.id,
      },
      create: {
        userId: args.userId,
        householdId: args.householdId,
        mode: RecommendationMode.GROUP,
        selectedUserIds: groupUserIds,
        savedGroupId: group.id,
      },
    });

    return resolveRecommendationContextState({
      viewerUserId: args.userId,
      householdMembers: options.householdMembers,
      savedGroups: options.savedGroups,
      storedContext: {
        mode: saved.mode,
        selectedUserIds: saved.selectedUserIds,
        savedGroupId: saved.savedGroupId,
      },
    }).context;
  }

  const adHocUserIds = normalizeSelectedUserIds(
    args.selectedUserIds.filter((userId) => validMemberIds.has(userId)),
  );

  if (adHocUserIds.length < 2) {
    throw new Error("Group context must contain at least two household members.");
  }

  const saved = await prisma.userRecommendationContext.upsert({
    where: {
      userId: args.userId,
    },
    update: {
      householdId: args.householdId,
      mode: RecommendationMode.GROUP,
      selectedUserIds: adHocUserIds,
      savedGroupId: null,
    },
    create: {
      userId: args.userId,
      householdId: args.householdId,
      mode: RecommendationMode.GROUP,
      selectedUserIds: adHocUserIds,
      savedGroupId: null,
    },
  });

  return resolveRecommendationContextState({
    viewerUserId: args.userId,
    householdMembers: options.householdMembers,
    savedGroups: options.savedGroups,
    storedContext: {
      mode: saved.mode,
      selectedUserIds: saved.selectedUserIds,
      savedGroupId: saved.savedGroupId,
    },
  }).context;
}

export async function getRecommendationContextBootstrap(args: {
  userId: string;
  householdId: string;
}) : Promise<RecommendationContextBootstrap> {
  await assertUserHouseholdAccess(args.userId, args.householdId);

  const [options, storedContext] = await Promise.all([
    getHouseholdContextOptions(args.householdId),
    prisma.userRecommendationContext.findUnique({
      where: {
        userId: args.userId,
      },
      select: {
        householdId: true,
        mode: true,
        selectedUserIds: true,
        savedGroupId: true,
      },
    }),
  ]);

  const storedContextForHousehold =
    storedContext && storedContext.householdId === args.householdId
      ? {
          mode: storedContext.mode,
          selectedUserIds: storedContext.selectedUserIds,
          savedGroupId: storedContext.savedGroupId,
        }
      : null;

  const resolved = resolveRecommendationContextState({
    viewerUserId: args.userId,
    householdMembers: options.householdMembers,
    savedGroups: options.savedGroups,
    storedContext: storedContextForHousehold,
  });

  if (
    storedContext &&
    (storedContext.householdId !== args.householdId || resolved.wasNormalized)
  ) {
    await persistRecommendationContext({
      userId: args.userId,
      householdId: args.householdId,
      mode: resolved.context.mode,
      selectedUserIds: resolved.context.selectedUserIds,
      savedGroupId: resolved.context.savedGroupId,
    });
  }

  return {
    householdMembers: options.householdMembers,
    savedGroups: options.savedGroups,
    context: resolved.context,
  };
}
