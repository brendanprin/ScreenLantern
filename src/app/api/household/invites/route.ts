import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { createHouseholdInvite, HouseholdError } from "@/lib/services/household";

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
    if (error instanceof HouseholdError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: "Unable to create invite." }, { status: 400 });
  }
}
