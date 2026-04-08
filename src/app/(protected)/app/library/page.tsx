import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TitleCard } from "@/components/title-card";
import { getCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";
import { INTERACTION_LABELS } from "@/lib/constants";
import { deriveCompactFitLabel } from "@/lib/fit-labels";
import {
  getLibraryWorkspace,
  LIBRARY_COLLECTION_OPTIONS,
  LIBRARY_FOCUS_OPTIONS,
  LIBRARY_SOURCE_OPTIONS,
  LIBRARY_SORT_OPTIONS,
  type LibraryCollection,
  type LibraryFocus,
  type LibrarySource,
  type LibrarySort,
} from "@/lib/services/library";
import { buildTitleHandoff } from "@/lib/services/provider-handoff";
import { cn } from "@/lib/utils";

const COLLECTION_LABELS: Record<LibraryCollection, string> = {
  overview: "Overview",
  WATCHLIST: INTERACTION_LABELS.WATCHLIST,
  WATCHED: INTERACTION_LABELS.WATCHED,
  LIKE: INTERACTION_LABELS.LIKE,
  DISLIKE: INTERACTION_LABELS.DISLIKE,
  HIDE: INTERACTION_LABELS.HIDE,
  shared_group: "Shared for this group",
  shared_household: "Shared for household",
};

const FOCUS_LABELS: Record<LibraryFocus, string> = {
  all: "All",
  available: "Available now",
  movies: "Movies",
  shows: "Shows",
  unwatched: "Unwatched",
};

const SORT_LABELS: Record<LibrarySort, string> = {
  smart: "Smart",
  recent: "Recently saved",
  runtime: "Shorter runtime",
};

const SOURCE_LABELS: Record<LibrarySource, string> = {
  all: "All personal items",
  imported: "Imported from integrations",
  manual: "Added in ScreenLantern",
};

interface LibraryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readSingleParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const user = await getCurrentUserContext();
  const params = await searchParams;
  const requestedCollection =
    readSingleParam(params.collection) ?? readSingleParam(params.tab);
  const requestedFocus = readSingleParam(params.focus);
  const requestedSort = readSingleParam(params.sort);
  const requestedSource = readSingleParam(params.source);
  const workspace = await getLibraryWorkspace({
    userId: user.userId,
    householdId: user.householdId,
    collection: requestedCollection,
    focus: requestedFocus,
    sort: requestedSort,
    source: requestedSource,
  });
  const baseParams = new URLSearchParams();

  function buildHref(updates: {
    collection?: string;
    focus?: string;
    sort?: string;
    source?: string;
  }) {
    const next = new URLSearchParams(baseParams);

    const collection = updates.collection ?? workspace.collection;
    const focus = updates.focus ?? workspace.focus;
    const sort = updates.sort ?? workspace.sort;
    const source = updates.source ?? workspace.source;

    if (collection !== "overview") {
      next.set("collection", collection);
    }

    if (focus !== "all") {
      next.set("focus", focus);
    }

    if (sort !== "smart") {
      next.set("sort", sort);
    }

    if (workspace.showSourceFilters && source !== "all") {
      next.set("source", source);
    } else {
      next.delete("source");
    }

    const query = next.toString();
    return query ? `/app/library?${query}` : "/app/library";
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-white via-white to-accent/60">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Library</p>
          <CardTitle className="max-w-3xl text-4xl">
            {`Decision workspace for ${workspace.contextLabel}`}
          </CardTitle>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {workspace.isGroupMode
              ? "ScreenLantern is combining saved titles, provider access, and exact-group watch history so this room can decide faster without losing solo taste boundaries."
              : "ScreenLantern is turning this profile's saved titles, watch history, and provider access into a more actionable workspace."}
          </p>
        </CardHeader>
      </Card>

      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle className="text-xl">Library controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/70">
              Collections
            </p>
            <div className="flex flex-wrap gap-2">
              {LIBRARY_COLLECTION_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={buildHref({ collection: option })}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition",
                    workspace.collection === option
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {COLLECTION_LABELS[option]}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/70">
              Decision filters
            </p>
            <div className="flex flex-wrap gap-2">
              {LIBRARY_FOCUS_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={buildHref({ focus: option })}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition",
                    workspace.focus === option
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {FOCUS_LABELS[option]}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/70">
              Sort
            </p>
            <div className="flex flex-wrap gap-2">
              {LIBRARY_SORT_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={buildHref({ sort: option })}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition",
                    workspace.sort === option
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {SORT_LABELS[option]}
                </Link>
              ))}
            </div>
          </div>

          {workspace.showSourceFilters ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/70">
                Source
              </p>
              <div className="flex flex-wrap gap-2">
                {LIBRARY_SOURCE_OPTIONS.map((option) => (
                  <Link
                    key={option}
                    href={buildHref({ source: option })}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm transition",
                      workspace.source === option
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {SOURCE_LABELS[option]}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {workspace.sections.map((section) => (
        <Card
          key={section.id}
          className="bg-white/80"
          data-testid={`library-section-${section.id}`}
        >
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {section.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-background/40 p-5 text-sm text-muted-foreground">
                {section.emptyMessage}
              </div>
            ) : (
              <div className="grid gap-5">
                {section.items.map((item) => (
                  <TitleCard
                    key={`${section.id}-${item.tmdbKey}`}
                    testId={`library-card-${section.id}-${item.title.mediaType}-${item.title.tmdbId}`}
                    title={item.title}
                    activeTypes={item.activeTypes}
                    actingUserId={
                      section.actionMode === "solo_full" ||
                      section.actionMode === "shared_only"
                        ? workspace.actingUserId ?? undefined
                        : undefined
                    }
                    activeGroupWatch={item.activeGroupWatch}
                    sharedWatchlistState={item.sharedWatchlistState}
                    showGroupWatchAction={
                      section.actionMode === "group_watch" ||
                      section.actionMode === "shared_group"
                    }
                    showGroupSaveAction={section.showGroupSaveAction}
                    showHouseholdSaveAction={section.showHouseholdSaveAction}
                    showSoloWatchedAction={
                      section.actionMode === "solo_full" ||
                      section.actionMode === "shared_only"
                    }
                    showPreferenceActions={section.actionMode === "solo_full"}
                    showActions={section.actionMode !== "none"}
                    recommendationExplanations={item.explanations}
                    recommendationContextLabel={workspace.contextLabel}
                    recommendationBadges={item.badges}
                    personalSourceBadge={item.personalSourceBadge}
                    handoff={buildTitleHandoff(
                      item.title,
                      user.preferredProviders,
                      env.tmdbWatchRegion,
                    )}
                    fitSummaryLabel={deriveCompactFitLabel({
                      explanations: item.explanations,
                      isGroupMode: workspace.isGroupMode,
                      contextLabel: workspace.contextLabel,
                    })}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
