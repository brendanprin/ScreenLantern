import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { runInternalTraktSync } from "@/lib/services/trakt";

const schema = z.object({
  userId: z.string().min(1),
  force: z.boolean().optional(),
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
    return NextResponse.json({ error: "Invalid internal sync payload." }, { status: 400 });
  }

  const result = await runInternalTraktSync(parsed.data);
  return NextResponse.json({ ok: true, result });
}
