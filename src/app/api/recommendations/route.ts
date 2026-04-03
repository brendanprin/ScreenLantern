import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { getRecommendedTitles } from "@/lib/services/recommendations";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getCurrentUserContext();
  const { searchParams } = new URL(request.url);
  const requestedUserIds = searchParams
    .get("userIds")
    ?.split(",")
    .filter(Boolean) ?? [user.userId];

  const members = await prisma.user.findMany({
    where: {
      householdId: user.householdId,
      id: { in: requestedUserIds },
    },
    select: {
      id: true,
    },
  });

  const safeUserIds = members.map((member) => member.id);

  const recommendations = await getRecommendedTitles({
    userIds: safeUserIds.length > 0 ? safeUserIds : [user.userId],
    requestedById: user.userId,
    householdId: user.householdId,
  });

  return NextResponse.json(recommendations);
}

