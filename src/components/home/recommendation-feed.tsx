"use client";

import { useDeferredValue, useEffect, useState } from "react";

import { TitleCard } from "@/components/title-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveContext } from "@/components/active-context-provider";
import type { RecommendationItem } from "@/lib/types";

interface RecommendationResponse {
  items: RecommendationItem[];
}

export function RecommendationFeed() {
  const { selectedUserIds, activeNames, isGroupMode } = useActiveContext();
  const deferredUserIds = useDeferredValue(selectedUserIds);
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecommendations() {
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/recommendations?userIds=${deferredUserIds.join(",")}`,
          {
            signal: controller.signal,
          },
        );
        const payload = (await response.json()) as RecommendationResponse;
        setItems(payload.items ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setItems([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadRecommendations();

    return () => controller.abort();
  }, [deferredUserIds]);

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
            {isGroupMode ? "Shared picks" : "Tonight"}
          </p>
          <CardTitle>
            {isGroupMode
              ? `Recommendations for ${activeNames.join(" + ")}`
              : `For ${activeNames[0] ?? "you"}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-muted-foreground">
          {isGroupMode
            ? "These picks favor safe overlap, shared genre signals, and provider access while penalizing any strong dislikes."
            : "These picks are tuned from your likes, watch history, hidden titles, runtime patterns, and preferred providers."}
        </CardContent>
      </Card>

      {isLoading ? (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Building your ScreenLantern picks...
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No recommendation candidates yet. Try liking a few titles or setting provider preferences first.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5">
        {items.map((item) => (
          <TitleCard
            key={`${item.title.mediaType}-${item.title.tmdbId}`}
            title={item.title}
            highlightReason={item.reasons[0]}
          />
        ))}
      </div>
    </div>
  );
}

