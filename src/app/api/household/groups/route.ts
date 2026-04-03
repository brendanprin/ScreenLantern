import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { createHouseholdGroup } from "@/lib/services/household";

export async function POST(request: Request) {
  const user = await getCurrentUserContext();
  const body = (await request.json()) as { name?: string; userIds?: string[] };

  try {
    await createHouseholdGroup({
      householdId: user.householdId,
      createdById: user.userId,
      name: body.name ?? "",
      userIds: body.userIds ?? [],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create group." },
      { status: 400 },
    );
  }
}

