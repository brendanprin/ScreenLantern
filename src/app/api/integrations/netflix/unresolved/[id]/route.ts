import { NextResponse } from "next/server";
import { InteractionType, SourceContext, UnresolvedImportStatus } from "@prisma/client";
import { z } from "zod";

import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTitleDetails } from "@/lib/services/catalog";
import { upsertTitleDetails } from "@/lib/services/title-cache";

const resolveSchema = z.object({
  action: z.literal("resolve"),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
});

const dismissSchema = z.object({
  action: z.literal("dismiss"),
});

const schema = z.discriminatedUnion("action", [resolveSchema, dismissSchema]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getCurrentUserContext();
  const { id } = await params;

  const row = await prisma.unresolvedImport.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  if (!row || row.userId !== user.userId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (row.status !== UnresolvedImportStatus.PENDING) {
    return NextResponse.json({ error: "Already resolved or dismissed." }, { status: 409 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (parsed.data.action === "dismiss") {
    await prisma.unresolvedImport.update({
      where: { id },
      data: { status: UnresolvedImportStatus.DISMISSED },
    });

    return NextResponse.json({ ok: true });
  }

  // Resolve: fetch the title by ID, upsert to cache, create WATCHED interaction
  const { tmdbId, mediaType } = parsed.data;

  const titleResult = await getTitleDetails(tmdbId, mediaType);

  if (!titleResult.data) {
    return NextResponse.json(
      { error: "Could not find that title in the catalog." },
      { status: 404 },
    );
  }

  const cachedTitle = await upsertTitleDetails(titleResult.data);

  await prisma.$transaction([
    prisma.userTitleInteraction.upsert({
      where: {
        userId_titleCacheId_interactionType: {
          userId: user.userId,
          titleCacheId: cachedTitle.id,
          interactionType: InteractionType.WATCHED,
        },
      },
      create: {
        userId: user.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.WATCHED,
        sourceContext: SourceContext.NETFLIX_IMPORTED,
      },
      update: {},
    }),
    prisma.unresolvedImport.update({
      where: { id },
      data: {
        status: UnresolvedImportStatus.RESOLVED,
        resolvedTitleCacheId: cachedTitle.id,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    resolvedTitle: {
      title: titleResult.data.title,
      mediaType: titleResult.data.mediaType,
      tmdbId: titleResult.data.tmdbId,
    },
  });
}
