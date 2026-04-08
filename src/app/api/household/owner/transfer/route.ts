import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { transferHouseholdOwnership, HouseholdError } from "@/lib/services/household";

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { memberId?: string };

  try {
    const newOwner = await transferHouseholdOwnership({
      householdId: user.householdId,
      requesterUserId: user.userId,
      memberId: body.memberId ?? "",
    });

    return NextResponse.json({ owner: newOwner });
  } catch (error) {
    if (error instanceof HouseholdError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: "Unable to transfer ownership." }, { status: 400 });
  }
}
