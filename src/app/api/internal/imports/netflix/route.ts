import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  importNetflixViewingHistory,
  summarizeNetflixHistoryImport,
} from "@/lib/services/netflix-history";

const schema = z.object({
  userEmail: z.string().email(),
  entries: z.array(
    z.object({
      title: z.string().trim().min(1),
      watchedAt: z.string().trim().optional().nullable(),
    }),
  ).min(1),
});

function hasValidInternalSecret(request: Request) {
  const header = request.headers.get("authorization");

  if (!env.internalSyncSecret || !header?.startsWith("Bearer ")) {
    return false;
  }

  return header.slice("Bearer ".length) === env.internalSyncSecret;
}

export async function POST(request: Request) {
  if (!env.internalSyncSecret) {
    return NextResponse.json(
      { error: "Internal sync secret is not configured." },
      { status: 503 },
    );
  }

  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Netflix sync payload." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: {
      email: parsed.data.userEmail,
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found for Netflix sync." }, { status: 404 });
  }

  const result = await importNetflixViewingHistory({
    userId: user.id,
    entries: parsed.data.entries,
  });

  return NextResponse.json({
    ok: true,
    result,
    summary: summarizeNetflixHistoryImport(result),
  });
}
