import { NextResponse } from "next/server";

import { getApiCurrentUserContext } from "@/lib/auth";
import {
  clearAssistantConversation,
  sendAssistantMessage,
} from "@/lib/services/assistant";
import { assistantMessageSchema } from "@/lib/validations/assistant";

function buildViewerContext(user: NonNullable<Awaited<ReturnType<typeof getApiCurrentUserContext>>>) {
  return {
    userId: user.userId,
    householdId: user.householdId,
    name: user.name,
    email: user.email,
    preferredProviders: user.preferredProviders,
  };
}

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = assistantMessageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid assistant prompt." },
      { status: 400 },
    );
  }

  try {
    const snapshot = await sendAssistantMessage({
      viewer: buildViewerContext(user),
      message: parsed.data.message,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to get an assistant answer.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const snapshot = await clearAssistantConversation({
      viewer: buildViewerContext(user),
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reset the assistant.",
      },
      { status: 500 },
    );
  }
}
