import { InteractionType } from "@prisma/client";
import { notFound } from "next/navigation";

import { ImportedInteractionControls } from "@/components/imported-interaction-controls";
import { InteractionButtons } from "@/components/interaction-buttons";
import { ProviderHandoffActions } from "@/components/provider-handoff-actions";
import { TitlePoster } from "@/components/title-poster";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  getInteractionOriginForType,
  getPersonalInteractionOriginLabel,
} from "@/lib/personal-interaction-sources";
import { prisma } from "@/lib/prisma";
import { getTitleDetails } from "@/lib/services/catalog";
import { getCurrentContextGroupWatchState } from "@/lib/services/group-watch-sessions";
import {
  getInteractionMap,
  getInteractionSourceStateMap,
} from "@/lib/services/interactions";
import {
  buildTitleHandoff,
  getProviderHandoffSupportLabel,
} from "@/lib/services/provider-handoff";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";
import { getCurrentSharedWatchlistState } from "@/lib/services/shared-watchlist";
import { getTitleFitSummary } from "@/lib/services/title-fit";
import { upsertTitleDetails } from "@/lib/services/title-cache";
import { cn, formatList, formatReleaseYear, formatRuntime } from "@/lib/utils";

interface TitleDetailPageProps {
  params: Promise<{ mediaType: "movie" | "tv"; tmdbId: string }>;
}


function fitToneBadgeClass(tone: "strong" | "good" | "neutral" | "conflict") {
  if (tone === "strong") {
    return "bg-primary/15 text-primary";
  }

  if (tone === "good") {
    return "bg-secondary text-secondary-foreground";
  }

  if (tone === "conflict") {
    return "border border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border border-border bg-background/60 text-foreground";
}

export default async function TitleDetailPage({ params }: TitleDetailPageProps) {
  const { mediaType, tmdbId } = await params;

  const parsedTmdbId = Number(tmdbId);
  if (mediaType !== "movie" && mediaType !== "tv") {
    notFound();
  }
  if (!Number.isInteger(parsedTmdbId) || parsedTmdbId <= 0) {
    notFound();
  }

  // Wave 1: fully independent
  const [user, detailResult] = await Promise.all([
    getCurrentUserContext(),
    getTitleDetails(parsedTmdbId, mediaType),
  ]);

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

  // Wave 2: contextBootstrap needs user; cachedTitle needs detailResult
  const [contextBootstrap, cachedTitle] = await Promise.all([
    getRecommendationContextBootstrap({
      userId: user.userId,
      householdId: user.householdId,
    }),
    detailResult.source === "cache"
      ? prisma.titleCache.findUniqueOrThrow({
          where: {
            tmdbId_mediaType: {
              tmdbId: details.tmdbId,
              mediaType: details.mediaType === "movie" ? "MOVIE" : "TV",
            },
          },
        })
      : upsertTitleDetails(details),
  ]);

  const actingUserId = contextBootstrap.context.isGroupMode
    ? user.userId
    : contextBootstrap.context.selectedUserIds[0] ?? user.userId;

  // Wave 3: all depend on cachedTitle.id and actingUserId
  const [interactionMap, activeGroupWatch, sharedWatchlistState, fitSummary, personalSourceState] =
    await Promise.all([
      getInteractionMap(actingUserId, [
        { tmdbId: details.tmdbId, mediaType: details.mediaType },
      ]),
      getCurrentContextGroupWatchState({
        userId: user.userId,
        householdId: user.householdId,
        titleCacheId: cachedTitle.id,
      }),
      getCurrentSharedWatchlistState({
        userId: user.userId,
        actorUserId: actingUserId,
        householdId: user.householdId,
        titleCacheId: cachedTitle.id,
      }),
      getTitleFitSummary({
        userId: user.userId,
        householdId: user.householdId,
        title: details,
        titleCacheId: cachedTitle.id,
      }),
      actingUserId === user.userId
        ? getInteractionSourceStateMap({
            userId: user.userId,
            titleCacheIds: [cachedTitle.id],
          }).then((m) => m.get(cachedTitle.id) ?? null)
        : Promise.resolve(null),
    ]);

  const activeTypes =
    interactionMap.get(`${details.mediaType}:${details.tmdbId}`) ?? [];
  const handoff = buildTitleHandoff(
    details,
    user.preferredProviders,
    env.tmdbWatchRegion,
  );
  const personalStateRows = [
    {
      type: InteractionType.WATCHLIST,
      label: "On my watchlist",
    },
    {
      type: InteractionType.WATCHED,
      label: "Watched",
    },
    {
      type: InteractionType.LIKE,
      label: "Liked",
    },
    {
      type: InteractionType.DISLIKE,
      label: "Disliked",
    },
    {
      type: InteractionType.HIDE,
      label: "Hidden",
    },
  ].filter((item) => activeTypes.includes(item.type));

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
                actingUserId={actingUserId}
                activeGroupWatch={activeGroupWatch}
                sharedWatchlistState={sharedWatchlistState}
                showGroupWatchAction
                showGroupSaveAction
                showHouseholdSaveAction
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <div
                  className="rounded-2xl border border-border/70 bg-background/60 p-4"
                  data-testid="title-personal-state"
                >
                  <p className="text-sm font-medium text-foreground">Your personal state</p>
                  {actingUserId === user.userId ? (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {personalStateRows.map((item) => (
                          <Badge key={item.type} variant="default">
                            {item.label}
                          </Badge>
                        ))}
                        {personalStateRows.length === 0 ? (
                          <Badge variant="outline">No personal state yet</Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {personalStateRows.map((item) => {
                          const origin = getInteractionOriginForType(
                            personalSourceState,
                            item.type,
                          );

                          if (!origin) {
                            return null;
                          }

                          return (
                            <p
                              key={`${item.type}-source`}
                              data-testid={`title-personal-state-${item.type.toLowerCase()}`}
                            >
                              <span className="font-medium text-foreground">{item.label}:</span>{" "}
                              {getPersonalInteractionOriginLabel({
                                interactionType: item.type,
                                origin,
                              })}
                            </p>
                          );
                        })}
                        {personalStateRows.length === 0 ? (
                          <p>
                            This title does not currently have personal watched, watchlist, or
                            taste state for your account.
                          </p>
                        ) : null}
                      </div>
                      {personalSourceState ? (
                        <div className="mt-4">
                          <ImportedInteractionControls
                            title={details}
                            sourceState={personalSourceState}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Source-aware imported details are only shown for your own personal profile.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <p className="text-sm font-medium text-foreground">Shared planning</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sharedWatchlistState.group?.isSaved ? (
                      <Badge variant="secondary">
                        Saved for {sharedWatchlistState.group.contextLabel}
                      </Badge>
                    ) : null}
                    {sharedWatchlistState.household?.isSaved ? (
                      <Badge variant="secondary">Saved for household</Badge>
                    ) : null}
                    {!sharedWatchlistState.group?.isSaved &&
                    !sharedWatchlistState.household?.isSaved ? (
                      <Badge variant="outline">No shared planning state</Badge>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {sharedWatchlistState.group?.isSaved ? (
                      <p>
                        Saved for {sharedWatchlistState.group.contextLabel} by{" "}
                        {formatList(sharedWatchlistState.group.savedByNames)}.
                      </p>
                    ) : null}
                    {sharedWatchlistState.household?.isSaved ? (
                      <p>
                        Saved for the household by{" "}
                        {formatList(sharedWatchlistState.household.savedByNames)}.
                      </p>
                    ) : null}
                    {!sharedWatchlistState.group?.isSaved &&
                    !sharedWatchlistState.household?.isSaved ? (
                      <p>
                        This title is not currently saved for the active group or the household.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="bg-white/80" data-testid="title-fit-summary">
          <CardHeader>
            <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
              {fitSummary.isGroupMode ? "Shared fit" : "Best for"}
            </p>
            <CardTitle>
              {fitSummary.isGroupMode
                ? `Fit for ${fitSummary.contextLabel}`
                : `Fit for ${fitSummary.contextLabel}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{fitSummary.badge}</Badge>
              {fitSummary.bestForLabel ? (
                <Badge variant="secondary">{fitSummary.bestForLabel}</Badge>
              ) : null}
              {fitSummary.isWatchedByCurrentGroup ? (
                <Badge variant="outline">Watched together</Badge>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
              <p className="text-xl font-semibold text-foreground">
                {fitSummary.headline}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {fitSummary.detail}
              </p>
              {fitSummary.supportNote ? (
                <p className="mt-3 text-sm text-foreground/80">{fitSummary.supportNote}</p>
              ) : null}
            </div>

            <p className="text-sm text-muted-foreground">
              ScreenLantern keeps solo taste, shared planning, and watched-together history separate, so this summary is about fit, not just raw saves.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white/80" data-testid="title-household-signals">
          <CardHeader>
            <CardTitle>Household signals</CardTitle>
            <p className="text-sm text-muted-foreground">
              Quick read on who has watched, saved, or thrown up a likely preference conflict.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {fitSummary.members.map((member) => (
              <div
                key={member.id}
                className="rounded-2xl border border-border bg-background/60 p-4"
                data-testid={`title-fit-member-${member.name.toLowerCase()}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{member.name}</p>
                  {member.isActiveContextMember ? (
                    <Badge variant="outline">
                      {fitSummary.isGroupMode ? "In current group" : "Active profile"}
                    </Badge>
                  ) : null}
                  <Badge className={cn("border-transparent", fitToneBadgeClass(member.tone))}>
                    {member.label}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{member.detail}</p>
                {member.chips.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {member.chips.map((chip) => (
                      <Badge key={`${member.id}-${chip}`} variant="outline">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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
          <CardContent className="space-y-4">
            <ProviderHandoffActions handoff={handoff} variant="detail" />

            {handoff.entries.length > 0 ? (
              handoff.entries.map((provider) => (
                <div
                  key={provider.providerName}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{provider.providerName}</span>
                    {provider.isSelectedService ? (
                      <Badge variant="secondary">Your service</Badge>
                    ) : null}
                    <Badge variant="outline">
                      {getProviderHandoffSupportLabel(provider.handoffKind)}
                    </Badge>
                  </div>
                  {provider.availabilityLabel ? (
                    <span className="text-muted-foreground">
                      {provider.availabilityLabel}
                    </span>
                  ) : null}
                </div>
              ))
            ) : null}
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
