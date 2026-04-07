"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { PersonalInteractionSourceState, TitleSummary } from "@/lib/types";

interface ImportedInteractionControlsProps {
  title: TitleSummary;
  sourceState: PersonalInteractionSourceState;
}

export function ImportedInteractionControls({
  title,
  sourceState,
}: ImportedInteractionControlsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canClearWatchlist = sourceState.WATCHLIST === "trakt";
  const canClearWatched = sourceState.WATCHED === "trakt";
  const canClearTaste =
    sourceState.LIKE === "trakt" || sourceState.DISLIKE === "trakt";

  async function clearImported(kind: "watchlist" | "watched" | "taste") {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/trakt/imported-interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          kind,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to clear imported state.");
      }

      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to clear imported state.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canClearWatchlist && !canClearWatched && !canClearTaste) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-border/80 bg-background/50 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Imported state</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Remove only the imported state for this title. Manual ScreenLantern actions stay intact.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canClearWatchlist ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => clearImported("watchlist")}
          >
            Remove imported watchlist
          </Button>
        ) : null}
        {canClearWatched ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => clearImported("watched")}
          >
            Remove imported watched state
          </Button>
        ) : null}
        {canClearTaste ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => clearImported("taste")}
          >
            Remove imported rating signal
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
