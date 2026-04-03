import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { revokeHouseholdInvite } from "@/lib/services/household";

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
    const message =
      error instanceof Error ? error.message : "Unable to revoke invite.";
    const isForbidden =
      message.includes("Only household owners") ||
      message.includes("do not have access");

    return NextResponse.json(
      { error: message },
      { status: isForbidden ? 403 : 400 },
    );
  }
}
