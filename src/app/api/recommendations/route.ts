import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";
import { buildTitleHandoff } from "@/lib/services/provider-handoff";
import { getRecommendedTitles } from "@/lib/services/recommendations";
import { prisma } from "@/lib/prisma";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";

export async function GET(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const explicitUserIds = searchParams
    .get("userIds")
    ?.split(",")
    .filter(Boolean);
  const requestedUserIds =
    explicitUserIds && explicitUserIds.length > 0
      ? explicitUserIds
      : (
          await getRecommendationContextBootstrap({
            userId: user.userId,
            householdId: user.householdId,
          })
        ).context.selectedUserIds;

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

  return NextResponse.json({
    ...recommendations,
    items: recommendations.items.map((item) => ({
      ...item,
      handoff: buildTitleHandoff(
        item.title,
        user.preferredProviders,
        env.tmdbWatchRegion,
      ),
    })),
    lanes: recommendations.lanes?.map((lane) => ({
      ...lane,
      items: lane.items.map((item) => ({
        ...item,
        handoff: buildTitleHandoff(
          item.title,
          user.preferredProviders,
          env.tmdbWatchRegion,
        ),
      })),
    })),
  });
}
