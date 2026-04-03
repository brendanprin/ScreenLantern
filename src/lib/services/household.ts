import { randomBytes } from "node:crypto";

import { HouseholdRole, Prisma } from "@prisma/client";

import {
  canManageHousehold,
  canRemoveHouseholdMember,
  canTransferHouseholdOwnership,
} from "@/lib/household-permissions";
import { prisma } from "@/lib/prisma";
import {
  createGroupSchema,
  createInviteSchema,
  removeMemberSchema,
  transferOwnershipSchema,
  updateProviderPreferencesSchema,
} from "@/lib/validations/household";

type InviteRecord = {
  redeemedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
};

export type HouseholdInviteStatus =
  | "ACTIVE"
  | "REDEEMED"
  | "REVOKED"
  | "EXPIRED";

export function normalizeInviteCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

export function getHouseholdInviteStatus(invite: InviteRecord): HouseholdInviteStatus {
  if (invite.redeemedAt) {
    return "REDEEMED";
  }

  if (invite.revokedAt) {
    return "REVOKED";
  }

  if (invite.expiresAt.getTime() <= Date.now()) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

function createInviteCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

async function ensureOwnerAccess(userId: string, householdId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      householdId: true,
      householdRole: true,
      name: true,
    },
  });

  if (!actor || actor.householdId !== householdId) {
    throw new Error("You do not have access to this household.");
  }

  if (!canManageHousehold(actor.householdRole)) {
    throw new Error("Only household owners can manage household governance.");
  }

  return actor;
}

export async function transferHouseholdOwnership(args: {
  householdId: string;
  requesterUserId: string;
  memberId: string;
}) {
  const parsed = transferOwnershipSchema.safeParse({ memberId: args.memberId });

  if (!parsed.success) {
    throw new Error("Invalid ownership transfer request.");
  }

  const actor = await ensureOwnerAccess(args.requesterUserId, args.householdId);

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.memberId },
    select: {
      id: true,
      householdId: true,
      householdRole: true,
      name: true,
      email: true,
    },
  });

  if (!target || target.householdId !== args.householdId) {
    throw new Error("Member not found.");
  }

  if (
    !canTransferHouseholdOwnership({
      actorRole: actor.householdRole,
      targetRole: target.householdRole,
      isSelf: actor.id === target.id,
    })
  ) {
    throw new Error(
      "Ownership can only be transferred from the current owner to another household member.",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: {
        householdRole: HouseholdRole.MEMBER,
      },
    });

    return tx.user.update({
      where: { id: target.id },
      data: {
        householdRole: HouseholdRole.OWNER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        householdRole: true,
      },
    });
  });
}

export async function createHouseholdWithOwner(args: {
  name: string;
  email: string;
  passwordHash: string;
  householdName?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        name: args.householdName?.trim() || `${args.name}'s Household`,
      },
    });

    const user = await tx.user.create({
      data: {
        email: args.email,
        name: args.name,
        passwordHash: args.passwordHash,
        householdId: household.id,
        householdRole: HouseholdRole.OWNER,
      },
    });

    return { household, user };
  });
}

export async function redeemHouseholdInviteForRegistration(args: {
  inviteCode: string;
  name: string;
  email: string;
  passwordHash: string;
}) {
  const inviteCode = normalizeInviteCode(args.inviteCode);

  return prisma.$transaction(async (tx) => {
    const invite = await tx.householdInvite.findUnique({
      where: { code: inviteCode },
      select: {
        id: true,
        householdId: true,
        role: true,
        expiresAt: true,
        redeemedAt: true,
        revokedAt: true,
      },
    });

    if (!invite) {
      throw new Error("That invite code is invalid.");
    }

    if (getHouseholdInviteStatus(invite) !== "ACTIVE") {
      throw new Error("That invite is no longer active.");
    }

    const user = await tx.user.create({
      data: {
        email: args.email,
        name: args.name,
        passwordHash: args.passwordHash,
        householdId: invite.householdId,
        householdRole: invite.role,
      },
    });

    const redeemedInvite = await tx.householdInvite.updateMany({
      where: {
        id: invite.id,
        redeemedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        redeemedAt: new Date(),
        redeemedById: user.id,
      },
    });

    if (redeemedInvite.count !== 1) {
      throw new Error("That invite is no longer active.");
    }

    return user;
  });
}

export async function getInvitePreview(code: string) {
  const normalizedCode = normalizeInviteCode(code);

  if (!normalizedCode) {
    return null;
  }

  const invite = await prisma.householdInvite.findUnique({
    where: { code: normalizedCode },
    include: {
      household: {
        select: {
          id: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!invite) {
    return null;
  }

  return {
    code: invite.code,
    householdId: invite.householdId,
    householdName: invite.household.name,
    createdByName: invite.createdBy.name,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    status: getHouseholdInviteStatus(invite),
  };
}

export async function createHouseholdInvite(args: {
  householdId: string;
  createdById: string;
  expiresInDays?: number;
}) {
  const parsed = createInviteSchema.safeParse({
    expiresInDays: args.expiresInDays,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid invite input.");
  }

  await ensureOwnerAccess(args.createdById, args.householdId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parsed.data.expiresInDays);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createInviteCode();

    try {
      return await prisma.householdInvite.create({
        data: {
          householdId: args.householdId,
          createdById: args.createdById,
          code,
          expiresAt,
          role: HouseholdRole.MEMBER,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to create an invite right now. Please try again.");
}

export async function revokeHouseholdInvite(args: {
  householdId: string;
  requesterUserId: string;
  inviteId: string;
}) {
  await ensureOwnerAccess(args.requesterUserId, args.householdId);

  const invite = await prisma.householdInvite.findUnique({
    where: { id: args.inviteId },
    select: {
      id: true,
      householdId: true,
      redeemedAt: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!invite || invite.householdId !== args.householdId) {
    throw new Error("Invite not found.");
  }

  if (getHouseholdInviteStatus(invite) !== "ACTIVE") {
    throw new Error("Only active invites can be revoked.");
  }

  return prisma.householdInvite.update({
    where: { id: invite.id },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function removeHouseholdMember(args: {
  householdId: string;
  requesterUserId: string;
  memberId: string;
}) {
  const parsed = removeMemberSchema.safeParse({ memberId: args.memberId });

  if (!parsed.success) {
    throw new Error("Invalid member removal request.");
  }

  const actor = await prisma.user.findUnique({
    where: { id: args.requesterUserId },
    select: {
      id: true,
      householdId: true,
      householdRole: true,
    },
  });

  if (!actor || actor.householdId !== args.householdId) {
    throw new Error("You do not have access to this household.");
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.memberId },
    select: {
      id: true,
      name: true,
      householdId: true,
      householdRole: true,
    },
  });

  if (!target || target.householdId !== args.householdId) {
    throw new Error("Member not found.");
  }

  if (
    !canRemoveHouseholdMember({
      actorRole: actor.householdRole,
      targetRole: target.householdRole,
      isSelf: actor.id === target.id,
    })
  ) {
    throw new Error(
      "Only household owners can remove members, and owners cannot remove themselves or other owners in MVP.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const newHousehold = await tx.household.create({
      data: {
        name: `${target.name}'s Household`,
      },
    });

    await tx.householdGroup.deleteMany({
      where: {
        householdId: args.householdId,
        createdById: target.id,
      },
    });

    await tx.householdGroupMember.deleteMany({
      where: {
        userId: target.id,
        group: {
          householdId: args.householdId,
        },
      },
    });

    await tx.householdInvite.updateMany({
      where: {
        householdId: args.householdId,
        createdById: target.id,
        redeemedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return tx.user.update({
      where: { id: target.id },
      data: {
        householdId: newHousehold.id,
        householdRole: HouseholdRole.OWNER,
      },
    });
  });
}

export async function createHouseholdGroup(args: {
  householdId: string;
  createdById: string;
  name: string;
  userIds: string[];
}) {
  const parsed = createGroupSchema.safeParse({
    name: args.name,
    userIds: args.userIds,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid group input.");
  }

  const creator = await prisma.user.findUnique({
    where: { id: args.createdById },
    select: {
      id: true,
      householdId: true,
    },
  });

  if (!creator || creator.householdId !== args.householdId) {
    throw new Error("You do not have access to this household.");
  }

  const members = await prisma.user.findMany({
    where: {
      householdId: args.householdId,
      id: { in: parsed.data.userIds },
    },
    select: {
      id: true,
    },
  });

  if (members.length !== parsed.data.userIds.length) {
    throw new Error("All members must belong to the same household.");
  }

  return prisma.householdGroup.create({
    data: {
      householdId: args.householdId,
      createdById: args.createdById,
      name: parsed.data.name,
      members: {
        createMany: {
          data: parsed.data.userIds.map((userId) => ({ userId })),
        },
      },
    },
  });
}

export async function updateProviderPreferences(args: {
  userId: string;
  providers: string[];
}) {
  const parsed = updateProviderPreferencesSchema.safeParse({
    providers: args.providers,
  });

  if (!parsed.success) {
    throw new Error("Invalid provider preferences.");
  }

  return prisma.user.update({
    where: { id: args.userId },
    data: {
      preferredProviders: parsed.data.providers,
    },
  });
}

export async function getHouseholdSummary(householdId: string) {
  return prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    include: {
      users: {
        orderBy: [{ householdRole: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          householdRole: true,
          preferredProviders: true,
        },
      },
      invites: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          code: true,
          role: true,
          expiresAt: true,
          redeemedAt: true,
          revokedAt: true,
          createdAt: true,
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          redeemedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      groups: {
        orderBy: { name: "asc" },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });
}
