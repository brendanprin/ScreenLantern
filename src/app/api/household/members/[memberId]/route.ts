import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { removeHouseholdMember, HouseholdError } from "@/lib/services/household";

interface RouteProps {
  params: Promise<{ memberId: string }>;
}

export async function DELETE(_: Request, { params }: RouteProps) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { memberId } = await params;

  try {
    await removeHouseholdMember({
      householdId: user.householdId,
      requesterUserId: user.userId,
      memberId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HouseholdError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: "Unable to remove member." }, { status: 400 });
  }
}
