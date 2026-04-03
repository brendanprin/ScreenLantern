import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { markReminderRead } from "@/lib/services/reminders";

export async function POST(
  _request: Request,
  context: { params: Promise<{ reminderId: string }> },
) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { reminderId } = await context.params;

  try {
    await markReminderRead({
      reminderId,
      userId: user.userId,
      householdId: user.householdId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to mark reminder as read.",
      },
      { status: 404 },
    );
  }
}
