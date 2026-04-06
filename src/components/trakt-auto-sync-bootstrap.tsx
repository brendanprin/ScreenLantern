"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import type { TraktAutoSyncResult } from "@/lib/types";

export function TraktAutoSyncBootstrap() {
  const router = useRouter();
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (hasAttempted.current) {
      return;
    }

    hasAttempted.current = true;
    let isCancelled = false;

    async function run() {
      try {
        const response = await fetch("/api/integrations/trakt/sync/auto", {
          method: "POST",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          result?: TraktAutoSyncResult;
        };

        if (!isCancelled && payload.result?.outcome === "synced") {
          router.refresh();
        }
      } catch {
        // Silent by design: freshness should not interrupt the current page.
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [router]);

  return null;
}
