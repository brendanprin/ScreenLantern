"use client";

import { useDeferredValue, useEffect, useState } from "react";

import { TitleCard } from "@/components/title-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveContext } from "@/components/active-context-provider";
import { deriveCompactFitLabel } from "@/lib/fit-labels";
import type { RecommendationItem, RecommendationLane } from "@/lib/types";

interface RecommendationResponse {
  items: RecommendationItem[];
  lanes?: RecommendationLane[];
}

export function RecommendationFeed() {
  const { selectedUserIds, activeNames, isGroupMode } = useActiveContext();
  const deferredUserIds = useDeferredValue(selectedUserIds);
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [lanes, setLanes] = useState<RecommendationLane[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const contextLabel =
    activeNames.length > 0
      ? isGroupMode
        ? activeNames.join(" + ")
        : activeNames[0]
      : isGroupMode
        ? "this group"
        : "you";

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
        setLanes(payload.lanes ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setItems([]);
          setLanes([]);
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

      {!isLoading && items.length === 0 && lanes.length === 0 ? (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No recommendation candidates yet. Try liking a few titles or setting provider preferences first.
          </CardContent>
        </Card>
      ) : null}

      {lanes.map((lane) => (
        <Card
          key={lane.id}
          className="bg-white/80"
          data-testid={`recommendation-lane-${lane.id}`}
        >
          <CardHeader>
            <CardTitle>{lane.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{lane.description}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5">
              {lane.items.map((item) => (
                <TitleCard
                  key={`${lane.id}-${item.title.mediaType}-${item.title.tmdbId}`}
                  title={item.title}
                  recommendationExplanations={item.explanations}
                  recommendationContextLabel={contextLabel}
                  recommendationBadges={item.badges}
                  fitSummaryLabel={deriveCompactFitLabel({
                    explanations: item.explanations,
                    isGroupMode,
                    contextLabel,
                  })}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="grid gap-5">
        {items.map((item) => (
          <TitleCard
            key={`${item.title.mediaType}-${item.title.tmdbId}`}
            title={item.title}
            recommendationExplanations={item.explanations}
            recommendationContextLabel={contextLabel}
            recommendationBadges={item.badges}
            fitSummaryLabel={deriveCompactFitLabel({
              explanations: item.explanations,
              isGroupMode,
              contextLabel,
            })}
          />
        ))}
      </div>
    </div>
  );
}
