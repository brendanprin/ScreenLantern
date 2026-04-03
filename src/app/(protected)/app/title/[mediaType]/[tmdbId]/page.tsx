import { InteractionType } from "@prisma/client";
import { notFound } from "next/navigation";

import { InteractionButtons } from "@/components/interaction-buttons";
import { TitlePoster } from "@/components/title-poster";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getTitleDetails } from "@/lib/services/catalog";
import { getCurrentContextGroupWatchState } from "@/lib/services/group-watch-sessions";
import { getInteractionMap } from "@/lib/services/interactions";
import { upsertTitleCache } from "@/lib/services/title-cache";
import { formatReleaseYear, formatRuntime } from "@/lib/utils";

interface TitleDetailPageProps {
  params: Promise<{ mediaType: "movie" | "tv"; tmdbId: string }>;
}

export default async function TitleDetailPage({ params }: TitleDetailPageProps) {
  const { mediaType, tmdbId } = await params;
  const user = await getCurrentUserContext();
  const detailResult = await getTitleDetails(Number(tmdbId), mediaType);

  if (detailResult.notFound) {
    notFound();
  }

  if (!detailResult.data) {
    return (
      <div className="space-y-6">
        <Card className="bg-white/80">
          <CardHeader>
            <CardTitle>Title details unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {detailResult.notice ??
              "ScreenLantern could not load this title from TMDb right now. Please try again shortly."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const details = detailResult.data;

  const cachedTitle =
    detailResult.source === "cache"
      ? await prisma.titleCache.findUniqueOrThrow({
          where: {
            tmdbId_mediaType: {
              tmdbId: details.tmdbId,
              mediaType: details.mediaType === "movie" ? "MOVIE" : "TV",
            },
          },
        })
      : await upsertTitleCache(details);

  const interactionMap = await getInteractionMap(user.userId, [
    { tmdbId: details.tmdbId, mediaType: details.mediaType },
  ]);
  const activeTypes =
    interactionMap.get(`${details.mediaType}:${details.tmdbId}`) ?? [];
  const activeGroupWatch = await getCurrentContextGroupWatchState({
    userId: user.userId,
    householdId: user.householdId,
    titleCacheId: cachedTitle.id,
  });

  return (
    <div className="space-y-6">
      {detailResult.notice ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="p-4 text-sm text-amber-900">
            {detailResult.notice}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden bg-white/85">
        <CardContent className="p-6">
          <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <TitlePoster title={details.title} posterPath={details.posterPath} />
            <div className="space-y-5">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {details.mediaType === "movie" ? "Movie" : "Series"}
                  </Badge>
                  <Badge variant="outline">{formatReleaseYear(details.releaseDate)}</Badge>
                  <Badge variant="outline">{formatRuntime(details.runtimeMinutes)}</Badge>
                  {details.status ? <Badge variant="outline">{details.status}</Badge> : null}
                </div>
                <h1 className="font-display text-5xl">{details.title}</h1>
                <p className="mt-4 max-w-3xl text-base text-muted-foreground">
                  {details.overview}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {details.genres.map((genre) => (
                  <Badge key={genre} variant="outline">
                    {genre}
                  </Badge>
                ))}
              </div>

              <InteractionButtons
                title={details}
                activeTypes={activeTypes as InteractionType[]}
                activeGroupWatch={activeGroupWatch}
                showGroupWatchAction
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="bg-white/80 xl:col-span-2">
          <CardHeader>
            <CardTitle>Cast</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {details.cast.length > 0 ? (
              details.cast.map((member) => (
                <div
                  key={`${member.name}-${member.character ?? ""}`}
                  className="rounded-2xl border border-border bg-background/60 p-4"
                >
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {member.character ?? "Cast"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Cast metadata unavailable.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/80">
          <CardHeader>
            <CardTitle>Where to watch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {details.providers.length > 0 ? (
              details.providers.map((provider) => (
                <div
                  key={`${provider.name}-${provider.type ?? ""}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm"
                >
                  <span>{provider.name}</span>
                  {provider.type ? (
                    <span className="text-muted-foreground">
                      {provider.type === "flatrate"
                        ? "Included"
                        : provider.type === "free"
                          ? "Free"
                          : provider.type === "ads"
                            ? "With ads"
                            : provider.type === "rent"
                              ? "Rent"
                              : "Buy"}
                    </span>
                  ) : null}
                </div>
              ))
            ) : details.providerStatus === "unavailable" ? (
              <p className="text-sm text-muted-foreground">
                No watch providers were found for {env.tmdbWatchRegion}.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Provider availability is currently unavailable for {env.tmdbWatchRegion}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {details.mediaType === "tv" ? (
        <Card className="bg-white/80">
          <CardHeader>
            <CardTitle>Seasons</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {details.seasons.map((season) => (
              <div
                key={season.seasonNumber}
                className="rounded-2xl border border-border bg-background/60 p-4"
              >
                <p className="font-medium">{season.name}</p>
                <p className="text-sm text-muted-foreground">
                  {season.episodeCount} episodes
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
