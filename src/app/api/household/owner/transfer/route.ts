import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { transferHouseholdOwnership } from "@/lib/services/household";

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
    const message =
      error instanceof Error ? error.message : "Unable to transfer ownership.";
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
