import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { revokeHouseholdInvite, HouseholdError } from "@/lib/services/household";

interface RouteProps {
  params: Promise<{ inviteId: string }>;
}

export async function POST(_: Request, { params }: RouteProps) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { inviteId } = await params;

  try {
    await revokeHouseholdInvite({
      householdId: user.householdId,
      requesterUserId: user.userId,
      inviteId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HouseholdError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: "Unable to revoke invite." }, { status: 400 });
  }
}
