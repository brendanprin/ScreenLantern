import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiCurrentUserContext } from "@/lib/auth";
import { updateProviderPreferences } from "@/lib/services/household";

const schema = z.object({
  providers: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const user = await getApiCurrentUserContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid provider payload." }, { status: 400 });
  }

  await updateProviderPreferences({
    userId: user.userId,
    providers: parsed.data.providers,
  });

  return NextResponse.json({ ok: true });
}

