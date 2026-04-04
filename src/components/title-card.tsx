import Link from "next/link";
import { InteractionType } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InteractionButtons } from "@/components/interaction-buttons";
import { TitlePoster } from "@/components/title-poster";
import type {
  GroupWatchState,
  RecommendationExplanation,
  SharedWatchlistTitleState,
  TitleSummary,
} from "@/lib/types";
import {
  cn,
  dedupeByKey,
  formatReleaseYear,
  formatRuntime,
  mediaTypeLabel,
} from "@/lib/utils";

interface TitleCardProps {
  title: TitleSummary;
  activeTypes?: InteractionType[];
  actingUserId?: string;
  activeGroupWatch?: GroupWatchState;
  sharedWatchlistState?: SharedWatchlistTitleState;
  showGroupWatchAction?: boolean;
  showGroupSaveAction?: boolean;
  showHouseholdSaveAction?: boolean;
  showSoloWatchedAction?: boolean;
  showPreferenceActions?: boolean;
  showActions?: boolean;
  recommendationExplanations?: RecommendationExplanation[];
  recommendationContextLabel?: string;
  recommendationBadges?: string[];
  fitSummaryLabel?: string | null;
  testId?: string;
}

export function TitleCard({
  title,
  activeTypes = [],
  actingUserId,
  activeGroupWatch,
  sharedWatchlistState,
  showGroupWatchAction = false,
  showGroupSaveAction = false,
  showHouseholdSaveAction = false,
  showSoloWatchedAction = true,
  showPreferenceActions = true,
  showActions = true,
  recommendationExplanations = [],
  recommendationContextLabel,
  recommendationBadges = [],
  fitSummaryLabel,
  testId,
}: TitleCardProps) {
  const primaryExplanation = recommendationExplanations[0];

  return (
    <Card className="overflow-hidden bg-white/80" data-testid={testId}>
      <CardContent className="p-4">
        <div className="grid gap-4 md:grid-cols-[170px_minmax(0,1fr)]">
          <Link href={`/app/title/${title.mediaType}/${title.tmdbId}`}>
            <TitlePoster title={title.title} posterPath={title.posterPath} />
          </Link>
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge variant="secondary">{mediaTypeLabel(title.mediaType)}</Badge>
                <Badge variant="outline">{formatReleaseYear(title.releaseDate)}</Badge>
                <Badge variant="outline">{formatRuntime(title.runtimeMinutes)}</Badge>
              </div>
              <Link href={`/app/title/${title.mediaType}/${title.tmdbId}`}>
                <h3 className="font-display text-2xl leading-tight">{title.title}</h3>
              </Link>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {title.overview}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {fitSummaryLabel ? <Badge variant="outline">{fitSummaryLabel}</Badge> : null}
              {recommendationBadges.map((badge) => (
                <Badge
                  key={badge}
                  variant={badge === "Available now" ? "default" : "secondary"}
                >
                  {badge}
                </Badge>
              ))}
              {title.genres.slice(0, 4).map((genre) => (
                <Badge key={genre} variant="outline">
                  {genre}
                </Badge>
              ))}
              {dedupeByKey(title.providers, (provider) => provider.name)
                .slice(0, 2)
                .map((provider) => (
                  <Badge key={provider.name}>{provider.name}</Badge>
                ))}
            </div>
            {primaryExplanation ? (
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                <p
                  className="text-sm font-medium text-primary"
                  data-testid={testId ? `${testId}-primary-explanation` : undefined}
                >
                  {primaryExplanation.summary}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-sm font-medium text-primary/80 transition hover:text-primary">
                    Why this{recommendationContextLabel ? ` for ${recommendationContextLabel}` : ""}?
                  </summary>
                  <div className="mt-3 space-y-2">
                    {recommendationExplanations.map((explanation, index) => (
                      <div
                        key={`${explanation.category}-${index}`}
                        className={cn(
                          "rounded-lg border border-primary/10 bg-white/80 px-3 py-2",
                          index === 0 && "border-primary/20",
                        )}
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {explanation.summary}
                        </p>
                        {explanation.detail ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {explanation.detail}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ) : null}
            {showActions ? (
              <InteractionButtons
                title={title}
                activeTypes={activeTypes}
                actingUserId={actingUserId}
                activeGroupWatch={activeGroupWatch}
                sharedWatchlistState={sharedWatchlistState}
                showGroupWatchAction={showGroupWatchAction}
                showGroupSaveAction={showGroupSaveAction}
                showHouseholdSaveAction={showHouseholdSaveAction}
                showSoloWatchedAction={showSoloWatchedAction}
                showPreferenceActions={showPreferenceActions}
              />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
