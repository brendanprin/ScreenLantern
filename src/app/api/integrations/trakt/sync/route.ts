import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { syncTraktAccount } from "@/lib/services/trakt";

export async function POST() {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await syncTraktAccount({
      userId: user.userId,
      householdId: user.householdId,
      email: user.email,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to sync Trakt right now.",
      },
      { status: 400 },
    );
  }
}
