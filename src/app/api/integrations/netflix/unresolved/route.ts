import { NextResponse } from "next/server";
import { ImportSource, UnresolvedImportStatus } from "@prisma/client";

import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUserContext();

  const rows = await prisma.unresolvedImport.findMany({
    where: {
      userId: user.userId,
      source: ImportSource.NETFLIX,
      status: UnresolvedImportStatus.PENDING,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      rawTitle: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, items: rows });
}
