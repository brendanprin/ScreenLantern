import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { createHouseholdGroup } from "@/lib/services/household";

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { name?: string; userIds?: string[] };

  try {
    const group = await createHouseholdGroup({
      householdId: user.householdId,
      createdById: user.userId,
      name: body.name ?? "",
      userIds: body.userIds ?? [],
    });

    return NextResponse.json({ ok: true, groupId: group.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create group." },
      { status: 400 },
    );
  }
}
