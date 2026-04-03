"use client";

import { startTransition, useState } from "react";
import { Check, EyeOff, Heart, Plus, ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { InteractionType, SourceContext } from "@prisma/client";

import { useActiveContext } from "@/components/active-context-provider";
import { Button } from "@/components/ui/button";
import type { GroupWatchState, TitleSummary } from "@/lib/types";

interface InteractionButtonsProps {
  title: TitleSummary;
  activeTypes: InteractionType[];
  activeGroupWatch?: GroupWatchState;
  showGroupWatchAction?: boolean;
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
  showGroupWatchAction = false,
  actingUserId,
  showSoloWatchedAction = true,
  showPreferenceActions = true,
}: InteractionButtonsProps) {
  const router = useRouter();
  const { activeNames, isGroupMode } = useActiveContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {showPreferenceActions ? (
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(({ type, label, icon: Icon }) => {
            const isActive = activeTypes.includes(type);

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
                {label}
              </Button>
            );
          })}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
