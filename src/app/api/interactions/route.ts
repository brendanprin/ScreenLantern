import { InteractionType, SourceContext } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setInteraction } from "@/lib/services/interactions";
import { titlePayloadSchema } from "@/lib/validations/title";

const schema = z.object({
  title: titlePayloadSchema,
  interactionType: z.nativeEnum(InteractionType),
  active: z.boolean(),
  sourceContext: z.nativeEnum(SourceContext).optional(),
  actingUserId: z.string().min(1).optional(),
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

  const actingUserId = parsed.data.actingUserId ?? user.userId;

  if (actingUserId !== user.userId) {
    const actingUser = await prisma.user.findFirst({
      where: {
        id: actingUserId,
        householdId: user.householdId,
      },
      select: {
        id: true,
      },
    });

    if (!actingUser) {
      return NextResponse.json(
        { error: "You cannot update interactions for that profile." },
        { status: 403 },
      );
    }
  }

  await setInteraction({
    userId: actingUserId,
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
