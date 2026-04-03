import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { removeHouseholdMember } from "@/lib/services/household";

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
    const message =
      error instanceof Error ? error.message : "Unable to remove member.";
    const isForbidden =
      message.includes("Only household owners") ||
      message.includes("do not have access");

    return NextResponse.json(
      { error: message },
      { status: isForbidden ? 403 : 400 },
    );
  }
}
