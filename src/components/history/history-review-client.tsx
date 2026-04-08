"use client";

import { startTransition, useState } from "react";
import { ChevronDown, ChevronUp, EyeOff, Heart, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { SourceContext } from "@prisma/client";

import { Button } from "@/components/ui/button";
import type { WatchedHistoryItem } from "@/lib/services/interactions";
import type { TitleSummary } from "@/lib/types";

const PAGE_SIZE = 50;

const SOURCE_FILTER_LABELS: Record<string, string> = {
  all: "All",
  imported: "Imported",
  manual: "Added in ScreenLantern",
};

const ORIGIN_LABELS: Record<string, string> = {
  netflix: "Netflix",
  trakt: "Trakt",
  manual: "ScreenLantern",
};

interface HistoryReviewClientProps {
  initialItems: WatchedHistoryItem[];
  activeSource: "all" | "imported" | "manual";
}

export function HistoryReviewClient({
  initialItems,
  activeSource,
}: HistoryReviewClientProps) {
  const [ratings, setRatings] = useState<Map<string, "LIKE" | "DISLIKE" | null>>(
    () => new Map(),
  );
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [unratedVisible, setUnratedVisible] = useState(PAGE_SIZE);
  const [ratedExpanded, setRatedExpanded] = useState(false);

  function getEffectiveRating(item: WatchedHistoryItem): "LIKE" | "DISLIKE" | null {
    if (ratings.has(item.titleCacheId)) {
      return ratings.get(item.titleCacheId) ?? null;
    }
    return item.rating;
  }

  const visibleItems = initialItems.filter((item) => !hidden.has(item.titleCacheId));
  const allUnrated = visibleItems.filter((item) => getEffectiveRating(item) === null);
  const allRated = visibleItems.filter((item) => getEffectiveRating(item) !== null);

  // Progress: how many of the total (non-hidden) have a rating
  const totalCount = visibleItems.length;
  const ratedCount = allRated.length;
  const progressPct = totalCount > 0 ? Math.round((ratedCount / totalCount) * 100) : 0;

  // Unrated items shown in the queue (paginated)
  const unratedPage = allUnrated.slice(0, unratedVisible);
  const hasMoreUnrated = allUnrated.length > unratedVisible;

  async function handleRate(
    item: WatchedHistoryItem,
    type: "LIKE" | "DISLIKE" | "HIDE",
  ) {
    const id = item.titleCacheId;
    const currentRating = getEffectiveRating(item);
    const isActive = currentRating === type;

    if (type === "HIDE") {
      setHidden((prev) => new Set([...prev, id]));
    } else {
      setRatings((prev) => {
        const next = new Map(prev);
        next.set(id, isActive ? null : type);
        return next;
      });
    }

    setSubmitting((prev) => new Set([...prev, id]));
    setError(null);

    try {
      const response = await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title satisfies TitleSummary,
          interactionType: type,
          active: type === "HIDE" ? true : !isActive,
          sourceContext: SourceContext.MANUAL,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to update this title.");
      }
    } catch (err) {
      if (type === "HIDE") {
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        setRatings((prev) => {
          const next = new Map(prev);
          next.set(id, currentRating);
          return next;
        });
      }
      setError(err instanceof Error ? err.message : "Unable to update this title.");
    } finally {
      startTransition(() => {
        setSubmitting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div className="text-sm text-muted-foreground">
        <Link
          href="/app/library?collection=watched"
          className="hover:text-foreground hover:underline"
        >
          ← Library
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Rate your history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalCount === 0
            ? "Nothing watched yet. As you mark titles watched or import from Trakt or Netflix, they'll appear here."
            : allUnrated.length === 0
              ? "All caught up — every watched title has a rating."
              : `${allUnrated.length} of ${totalCount} watched ${totalCount === 1 ? "title" : "titles"} not yet rated — rating them improves your recommendations.`}
        </p>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{ratedCount} rated</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Source filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "imported", "manual"] as const).map((filter) => (
          <Link
            key={filter}
            href={`?source=${filter}`}
            className={[
              "rounded-md border px-3 py-1 text-sm transition-colors",
              activeSource === filter
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {SOURCE_FILTER_LABELS[filter]}
          </Link>
        ))}
      </div>

      {/* Unrated queue */}
      {allUnrated.length > 0 && (
        <section className="space-y-1">
          <div className="flex items-baseline justify-between pb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Up next to rate
            </p>
            <p className="text-xs text-muted-foreground">
              {Math.min(unratedVisible, allUnrated.length)} of {allUnrated.length}
            </p>
          </div>

          {unratedPage.map((item) => (
            <HistoryItem
              key={item.titleCacheId}
              item={item}
              effectiveRating={getEffectiveRating(item)}
              isSubmitting={submitting.has(item.titleCacheId)}
              onRate={handleRate}
            />
          ))}

          {hasMoreUnrated && (
            <button
              onClick={() => setUnratedVisible((prev) => prev + PAGE_SIZE)}
              className="w-full rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Show {Math.min(PAGE_SIZE, allUnrated.length - unratedVisible)} more
            </button>
          )}
        </section>
      )}

      {/* Rated — collapsible */}
      {allRated.length > 0 && (
        <section className="space-y-1">
          <button
            onClick={() => setRatedExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between pb-1 group"
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
              Already rated ({allRated.length})
            </p>
            {ratedExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </button>

          {ratedExpanded &&
            allRated.map((item) => (
              <HistoryItem
                key={item.titleCacheId}
                item={item}
                effectiveRating={getEffectiveRating(item)}
                isSubmitting={submitting.has(item.titleCacheId)}
                onRate={handleRate}
              />
            ))}
        </section>
      )}
    </div>
  );
}

interface HistoryItemProps {
  item: WatchedHistoryItem;
  effectiveRating: "LIKE" | "DISLIKE" | null;
  isSubmitting: boolean;
  onRate: (item: WatchedHistoryItem, type: "LIKE" | "DISLIKE" | "HIDE") => void;
}

function HistoryItem({ item, effectiveRating, isSubmitting, onRate }: HistoryItemProps) {
  const releaseYear = item.title.releaseDate
    ? new Date(item.title.releaseDate).getUTCFullYear()
    : null;

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      {/* Poster */}
      <div className="shrink-0 w-8 h-12 rounded overflow-hidden bg-muted flex items-center justify-center">
        {item.title.posterPath ? (
          <img
            src={`https://image.tmdb.org/t/p/w92${item.title.posterPath}`}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-muted-foreground text-xs">?</span>
        )}
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight truncate">{item.title.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {releaseYear && (
            <span className="text-xs text-muted-foreground">{releaseYear}</span>
          )}
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground">
            {ORIGIN_LABELS[item.origin] ?? item.origin}
          </span>
        </div>
      </div>

      {/* Rating buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant={effectiveRating === "LIKE" ? "default" : "outline"}
          className="h-7 px-2 gap-1 text-xs"
          disabled={isSubmitting}
          onClick={() => onRate(item, "LIKE")}
          aria-label={effectiveRating === "LIKE" ? "Remove like" : "Like"}
        >
          <Heart className="h-3.5 w-3.5" />
          Like
        </Button>
        <Button
          size="sm"
          variant={effectiveRating === "DISLIKE" ? "default" : "outline"}
          className="h-7 px-2 gap-1 text-xs"
          disabled={isSubmitting}
          onClick={() => onRate(item, "DISLIKE")}
          aria-label={effectiveRating === "DISLIKE" ? "Remove dislike" : "Dislike"}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          Dislike
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 gap-1 text-xs text-muted-foreground"
          disabled={isSubmitting}
          onClick={() => onRate(item, "HIDE")}
          aria-label="Hide"
        >
          <EyeOff className="h-3.5 w-3.5" />
          Hide
        </Button>
      </div>
    </div>
  );
}
