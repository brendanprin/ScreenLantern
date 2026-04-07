import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST() {
  await getCurrentUserContext();

  if (!env.streamingSyncUrl) {
    return NextResponse.json(
      { error: "Streaming sync sidecar is not configured (STREAMING_SYNC_URL missing)." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${env.streamingSyncUrl}/trigger`, {
      method: "POST",
    });

    const payload = (await response.json()) as { ok: boolean; error?: string };

    if (response.status === 409) {
      return NextResponse.json({ ok: false, error: "Sync is already running." }, { status: 409 });
    }

    if (!response.ok || !payload.ok) {
      return NextResponse.json(
        { error: payload.error ?? "Sidecar rejected the sync trigger." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the streaming sync sidecar." },
      { status: 502 },
    );
  }
}
