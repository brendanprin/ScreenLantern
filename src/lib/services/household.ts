import { prisma } from "@/lib/prisma";
import { createGroupSchema, updateProviderPreferencesSchema } from "@/lib/validations/household";

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
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          preferredProviders: true,
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

