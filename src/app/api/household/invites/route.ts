import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { createHouseholdInvite } from "@/lib/services/household";

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { expiresInDays?: number };

  try {
    const invite = await createHouseholdInvite({
      householdId: user.householdId,
      createdById: user.userId,
      expiresInDays: body.expiresInDays,
    });

    return NextResponse.json({ invite });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create invite.";
    const isForbidden =
      message.includes("Only household owners") ||
      message.includes("do not have access");

    return NextResponse.json(
      { error: message },
      {
        status: isForbidden ? 403 : 400,
      },
    );
  }
}
