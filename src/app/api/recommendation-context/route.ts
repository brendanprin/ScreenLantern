import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import {
  getRecommendationContextBootstrap,
  persistRecommendationContext,
} from "@/lib/services/recommendation-context";
import { updateRecommendationContextSchema } from "@/lib/validations/recommendation-context";

export async function GET() {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const bootstrap = await getRecommendationContextBootstrap({
    userId: user.userId,
    householdId: user.householdId,
  });

  return NextResponse.json(bootstrap.context);
}

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateRecommendationContextSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid recommendation context." },
      { status: 400 },
    );
  }

  try {
    const context = await persistRecommendationContext({
      userId: user.userId,
      householdId: user.householdId,
      mode: parsed.data.mode,
      selectedUserIds: parsed.data.selectedUserIds,
      savedGroupId: parsed.data.savedGroupId ?? null,
    });

    return NextResponse.json(context);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update recommendation context.",
      },
      { status: 400 },
    );
  }
}
