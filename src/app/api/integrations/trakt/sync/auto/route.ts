import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { maybeRunAutoTraktSync } from "@/lib/services/trakt";

export async function POST() {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await maybeRunAutoTraktSync({
    userId: user.userId,
    householdId: user.householdId,
    email: user.email,
  });

  return NextResponse.json({ ok: true, result });
}
