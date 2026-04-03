import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import { createGroupWatchSession } from "@/lib/services/group-watch-sessions";
import { createGroupWatchSessionSchema } from "@/lib/validations/recommendation-context";

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createGroupWatchSessionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid watch-session payload." },
      { status: 400 },
    );
  }

  try {
    const watchSession = await createGroupWatchSession({
      userId: user.userId,
      householdId: user.householdId,
      title: parsed.data.title,
    });

    return NextResponse.json({
      ok: true,
      watchSessionId: watchSession.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create a group watch session.",
      },
      { status: 400 },
    );
  }
}
