import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { disconnectTraktAccount } from "@/lib/services/trakt";

export async function POST() {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await disconnectTraktAccount({
      userId: user.userId,
      householdId: user.householdId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to disconnect Trakt.",
      },
      { status: 400 },
    );
  }
}
