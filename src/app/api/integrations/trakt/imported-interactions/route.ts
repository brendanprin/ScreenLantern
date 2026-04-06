import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiCurrentUserContext } from "@/lib/auth";
import { clearImportedInteractionState } from "@/lib/services/interactions";
import { titlePayloadSchema } from "@/lib/validations/title";

const schema = z.object({
  title: titlePayloadSchema,
  kind: z.enum(["watchlist", "watched", "taste"]),
});

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid imported-state payload." },
      { status: 400 },
    );
  }

  const result = await clearImportedInteractionState({
    userId: user.userId,
    title: parsed.data.title,
    kind: parsed.data.kind,
  });

  return NextResponse.json({ ok: true, result });
}
