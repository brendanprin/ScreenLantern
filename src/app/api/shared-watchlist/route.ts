import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { getApiCurrentUserContext } from "@/lib/auth";
import { setSharedWatchlistSave } from "@/lib/services/shared-watchlist";
import { sharedWatchlistMutationSchema } from "@/lib/validations/shared-watchlist";

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = sharedWatchlistMutationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid shared save payload." },
      { status: 400 },
    );
  }

  const actingUserId = parsed.data.actingUserId ?? user.userId;

  if (actingUserId !== user.userId) {
    const actingUser = await prisma.user.findFirst({
      where: {
        id: actingUserId,
        householdId: user.householdId,
      },
      select: {
        id: true,
      },
    });

    if (!actingUser) {
      return NextResponse.json(
        { error: "You cannot update shared saves for that profile." },
        { status: 403 },
      );
    }
  }

  try {
    await setSharedWatchlistSave({
      viewerUserId: user.userId,
      actingUserId,
      householdId: user.householdId,
      title: parsed.data.title,
      scope: parsed.data.scope,
      active: parsed.data.active,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update this shared save.",
      },
      { status: 400 },
    );
  }
}
