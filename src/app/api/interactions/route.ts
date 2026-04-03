import { InteractionType, SourceContext } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiCurrentUserContext } from "@/lib/auth";
import { setInteraction } from "@/lib/services/interactions";
import { titlePayloadSchema } from "@/lib/validations/title";

const schema = z.object({
  title: titlePayloadSchema,
  interactionType: z.nativeEnum(InteractionType),
  active: z.boolean(),
  sourceContext: z.nativeEnum(SourceContext).optional(),
});

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid interaction payload." }, { status: 400 });
  }

  await setInteraction({
    userId: user.userId,
    title: parsed.data.title,
    interactionType: parsed.data.interactionType,
    active: parsed.data.active,
    sourceContext:
      parsed.data.sourceContext && parsed.data.sourceContext !== SourceContext.GROUP
        ? parsed.data.sourceContext
        : SourceContext.MANUAL,
  });

  return NextResponse.json({ ok: true });
}
