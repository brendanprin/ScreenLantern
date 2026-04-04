"use client";

import { startTransition, useState } from "react";
import { Check, EyeOff, Heart, Plus, ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { InteractionType, SourceContext } from "@prisma/client";

import { useActiveContext } from "@/components/active-context-provider";
import { Button } from "@/components/ui/button";
import type {
  GroupWatchState,
  SharedWatchlistTitleState,
  TitleSummary,
} from "@/lib/types";

interface InteractionButtonsProps {
  title: TitleSummary;
  activeTypes: InteractionType[];
  activeGroupWatch?: GroupWatchState;
  sharedWatchlistState?: SharedWatchlistTitleState;
  showGroupWatchAction?: boolean;
  showGroupSaveAction?: boolean;
  showHouseholdSaveAction?: boolean;
  actingUserId?: string;
  showSoloWatchedAction?: boolean;
  showPreferenceActions?: boolean;
}

const ACTIONS = [
  { type: InteractionType.WATCHLIST, label: "Watchlist", icon: Plus },
  { type: InteractionType.LIKE, label: "Like", icon: Heart },
  { type: InteractionType.DISLIKE, label: "Dislike", icon: ThumbsDown },
  { type: InteractionType.HIDE, label: "Hide", icon: EyeOff },
] as const;

export function InteractionButtons({
  title,
  activeTypes,
  activeGroupWatch,
  sharedWatchlistState,
  showGroupWatchAction = false,
  showGroupSaveAction = false,
  showHouseholdSaveAction = false,
  actingUserId,
  showSoloWatchedAction = true,
  showPreferenceActions = true,
}: InteractionButtonsProps) {
  const router = useRouter();
  const { activeNames, isGroupMode } = useActiveContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function formatList(items: string[]) {
    if (items.length <= 1) {
      return items[0] ?? "";
    }

    if (items.length === 2) {
      return `${items[0]} and ${items[1]}`;
    }

    return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
  }

  async function handleAction(
    type: InteractionType,
    sourceContext: SourceContext = SourceContext.MANUAL,
  ) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          interactionType: type,
          active: !activeTypes.includes(type),
          sourceContext,
          actingUserId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to update this title.");
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update this title.",
      );
    } finally {
      startTransition(() => {
        setIsSubmitting(false);
        router.refresh();
      });
    }
  }

  async function handleGroupWatch() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/watch-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to save this group watch event.");
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to save this group watch event.",
      );
    } finally {
      startTransition(() => {
        setIsSubmitting(false);
        router.refresh();
      });
    }
  }

  async function handleSharedSave(scope: "GROUP" | "HOUSEHOLD", active: boolean) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/shared-watchlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          scope,
          active,
          actingUserId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to update this shared save.");
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update this shared save.",
      );
    } finally {
      startTransition(() => {
        setIsSubmitting(false);
        router.refresh();
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {showSoloWatchedAction ? (
          <Button
            type="button"
            variant={activeTypes.includes(InteractionType.WATCHED) ? "default" : "outline"}
            size="sm"
            disabled={isSubmitting}
            onClick={() => handleAction(InteractionType.WATCHED, SourceContext.SOLO)}
          >
            <Check className="h-4 w-4" />
            Watched by me
          </Button>
        ) : null}
        {showGroupWatchAction && isGroupMode ? (
          <Button
            type="button"
            variant={activeGroupWatch?.isWatchedByCurrentGroup ? "default" : "outline"}
            size="sm"
            disabled={isSubmitting || activeGroupWatch?.isWatchedByCurrentGroup}
            onClick={handleGroupWatch}
          >
            <Check className="h-4 w-4" />
            Watched by current group
          </Button>
        ) : null}
      </div>

      {showGroupWatchAction && activeGroupWatch?.isWatchedByCurrentGroup ? (
        <p className="text-sm text-muted-foreground">
          {activeNames.join(" + ")} already watched this together
          {activeGroupWatch.watchedAt
            ? ` on ${new Date(activeGroupWatch.watchedAt).toLocaleDateString()}.`
            : "."}
        </p>
      ) : null}

      {showGroupSaveAction || showHouseholdSaveAction ? (
        <div className="space-y-2 rounded-2xl border border-border/70 bg-background/60 p-3">
          <p className="text-sm font-medium text-foreground">Shared planning</p>
          <div className="flex flex-wrap gap-2">
            {showGroupSaveAction && isGroupMode ? (
              <Button
                type="button"
                variant={
                  sharedWatchlistState?.group?.isSavedByViewer ? "default" : "outline"
                }
                size="sm"
                disabled={isSubmitting}
                onClick={() =>
                  handleSharedSave(
                    "GROUP",
                    !Boolean(sharedWatchlistState?.group?.isSavedByViewer),
                  )
                }
              >
                <Plus className="h-4 w-4" />
                Save for current group
              </Button>
            ) : null}
            {showHouseholdSaveAction ? (
              <Button
                type="button"
                variant={
                  sharedWatchlistState?.household?.isSavedByViewer
                    ? "default"
                    : "outline"
                }
                size="sm"
                disabled={isSubmitting}
                onClick={() =>
                  handleSharedSave(
                    "HOUSEHOLD",
                    !Boolean(sharedWatchlistState?.household?.isSavedByViewer),
                  )
                }
              >
                <Plus className="h-4 w-4" />
                Save for household
              </Button>
            ) : null}
          </div>
          {sharedWatchlistState?.group?.isSaved ? (
            <p className="text-sm text-muted-foreground">
              Saved for {sharedWatchlistState.group.contextLabel}
              {sharedWatchlistState.group.savedByNames.length > 0
                ? ` by ${formatList(sharedWatchlistState.group.savedByNames)}.`
                : "."}
            </p>
          ) : null}
          {sharedWatchlistState?.household?.isSaved ? (
            <p className="text-sm text-muted-foreground">
              Saved for the household
              {sharedWatchlistState.household.savedByNames.length > 0
                ? ` by ${formatList(sharedWatchlistState.household.savedByNames)}.`
                : "."}
            </p>
          ) : null}
        </div>
      ) : null}

      {showPreferenceActions ? (
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(({ type, label, icon: Icon }) => {
            const isActive = activeTypes.includes(type);
            const resolvedLabel =
              type === InteractionType.WATCHLIST &&
              (showGroupSaveAction || showHouseholdSaveAction)
                ? "Save for me"
                : label;

            return (
              <Button
                key={type}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                disabled={isSubmitting}
                onClick={() => handleAction(type)}
              >
                <Icon className="h-4 w-4" />
                {resolvedLabel}
              </Button>
            );
          })}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
