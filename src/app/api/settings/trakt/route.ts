import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiCurrentUserContext } from "@/lib/auth";
import { updateTraktSyncMode } from "@/lib/services/trakt";

const schema = z.object({
  syncMode: z.enum(["OFF", "DAILY", "ON_LOGIN_OR_APP_OPEN"]),
});

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Trakt sync settings." }, { status: 400 });
  }

  try {
    await updateTraktSyncMode({
      userId: user.userId,
      householdId: user.householdId,
      syncMode: parsed.data.syncMode,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save Trakt sync settings.",
      },
      { status: 400 },
    );
  }
}
