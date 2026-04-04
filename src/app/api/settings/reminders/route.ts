import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { updateReminderPreferences } from "@/lib/services/reminders";
import { reminderPreferencesSchema } from "@/lib/validations/reminder-preferences";

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = reminderPreferencesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reminder preferences payload." },
      { status: 400 },
    );
  }

  await updateReminderPreferences({
    userId: user.userId,
    householdId: user.householdId,
    preferences: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
