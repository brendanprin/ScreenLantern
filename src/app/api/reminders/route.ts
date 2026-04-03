import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { getReminderInbox } from "@/lib/services/reminders";
import { reminderQuerySchema } from "@/lib/validations/reminders";

export async function GET(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = reminderQuerySchema.safeParse({
    userIds: searchParams.get("userIds") ?? undefined,
    mode: searchParams.get("mode") ?? undefined,
    savedGroupId: searchParams.get("savedGroupId") ?? undefined,
    refresh: searchParams.get("refresh") ?? undefined,
    summary: searchParams.get("summary") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reminder query." },
      { status: 400 },
    );
  }

  const reminders = await getReminderInbox({
    userId: user.userId,
    householdId: user.householdId,
    requestedMode: parsed.data.mode,
    requestedUserIds: parsed.data.userIds,
    requestedSavedGroupId: parsed.data.savedGroupId ?? null,
    refresh: parsed.data.refresh,
    summaryOnly: parsed.data.summary,
  });

  return NextResponse.json(reminders);
}
