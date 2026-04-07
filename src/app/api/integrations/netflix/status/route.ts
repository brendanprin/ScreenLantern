import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";

export async function GET() {
  await getCurrentUserContext();

  if (!env.streamingSyncUrl) {
    return NextResponse.json({
      ok: true,
      configured: false,
      sidecarReachable: false,
      state: null,
      intervalHours: 0,
    });
  }

  try {
    const response = await fetch(`${env.streamingSyncUrl}/status`, {
      next: { revalidate: 0 },
    });

    const payload = (await response.json()) as {
      ok: boolean;
      configured: boolean;
      intervalHours: number;
      state: {
        status: string;
        lastSyncStartedAt: string | null;
        lastSyncCompletedAt: string | null;
        lastResult: {
          imported: number;
          alreadyPresent: number;
          unmatched: number;
          scanned: number;
          summary: string;
        } | null;
        lastError: string | null;
        nextScheduledAt: string | null;
      };
    };

    return NextResponse.json({
      ok: true,
      sidecarReachable: true,
      configured: payload.configured,
      intervalHours: payload.intervalHours,
      state: payload.state,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      configured: false,
      sidecarReachable: false,
      state: null,
      intervalHours: 0,
    });
  }
}
