import { InteractionType, SourceContext } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { setInteraction } from "@/lib/services/interactions";

const schema = z.object({
  title: z.object({
    tmdbId: z.number(),
    mediaType: z.enum(["movie", "tv"]),
    title: z.string(),
    overview: z.string(),
    posterPath: z.string().nullable(),
    backdropPath: z.string().nullable(),
    releaseDate: z.string().nullable(),
    runtimeMinutes: z.number().nullable().optional(),
    genres: z.array(z.string()),
    voteAverage: z.number().nullable().optional(),
    popularity: z.number().nullable().optional(),
    providers: z.array(
      z.object({
        name: z.string(),
        id: z.number().optional(),
        logoPath: z.string().nullable().optional(),
        type: z.string().optional(),
      }),
    ),
  }),
  interactionType: z.nativeEnum(InteractionType),
  active: z.boolean(),
});

export async function POST(request: Request) {
  const session = await requireSession();
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid interaction payload." }, { status: 400 });
  }

  await setInteraction({
    userId: session.user.id,
    title: parsed.data.title,
    interactionType: parsed.data.interactionType,
    active: parsed.data.active,
    sourceContext: SourceContext.MANUAL,
  });

  return NextResponse.json({ ok: true });
}

