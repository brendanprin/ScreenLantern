"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Clock3, X } from "lucide-react";

import { useActiveContext } from "@/components/active-context-provider";
import { TitlePoster } from "@/components/title-poster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { emitReminderChangeEvent } from "@/components/reminders/reminder-nav-link";
import type { ReminderInboxResult, ReminderItem } from "@/lib/types";
import { formatReleaseYear, formatRuntime } from "@/lib/utils";

function buildContextLabel(activeNames: string[], isGroupMode: boolean) {
  if (isGroupMode) {
    return activeNames.join(" + ") || "this group";
  }

  return activeNames[0] ?? "you";
}

function categoryLabel(item: ReminderItem) {
  if (item.category === "available_now") {
    return "Available now";
  }

  if (item.category === "group_watch_candidate") {
    return "Group reminder";
  }

  return "Back on your radar";
}

export function ReminderInbox() {
  const {
    activeMode,
    activeNames,
    activeSavedGroupId,
    isGroupMode,
    selectedUserIds,
  } = useActiveContext();
  const deferredUserIds = useDeferredValue(selectedUserIds);
  const userIdsParam = deferredUserIds.join(",");
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tuningNote, setTuningNote] = useState<string | null>(null);
  const contextLabel = buildContextLabel(activeNames, isGroupMode);

  useEffect(() => {
    const controller = new AbortController();

    async function loadReminders() {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        userIds: userIdsParam,
        mode: activeMode,
        refresh: "1",
      });

      if (activeSavedGroupId) {
        params.set("savedGroupId", activeSavedGroupId);
      }

      try {
        const response = await fetch(`/api/reminders?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to load reminders.");
        }

        const payload = (await response.json()) as ReminderInboxResult;

        if (!controller.signal.aborted) {
          setItems(payload.items ?? []);
          setUnreadCount(payload.unreadCount ?? 0);
          setTuningNote(payload.tuningNote ?? null);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setItems([]);
          setUnreadCount(0);
          setTuningNote(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load reminders.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadReminders();

    return () => controller.abort();
  }, [activeMode, activeSavedGroupId, userIdsParam]);

  const unreadItems = useMemo(
    () => items.filter((item) => !item.isRead),
    [items],
  );
  const readItems = useMemo(
    () => items.filter((item) => item.isRead),
    [items],
  );

  async function handleReminderAction(
    reminderId: string,
    action: "read" | "dismiss",
  ) {
    const response = await fetch(`/api/reminders/${reminderId}/${action}`, {
      method: "POST",
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(
        payload.error ??
          (action === "read"
            ? "Unable to mark reminder as read."
            : "Unable to dismiss reminder."),
      );
    }

    setItems((current) =>
      current
        .map((item) =>
          item.id !== reminderId
            ? item
            : action === "read"
              ? { ...item, isRead: true }
              : null,
        )
        .filter((item): item is ReminderItem => Boolean(item)),
    );
    setUnreadCount((current) =>
      action === "read" ? Math.max(0, current - 1) : current,
    );
    emitReminderChangeEvent();
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-white via-white to-accent/60">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
            Reminder center
          </p>
          <CardTitle className="max-w-3xl text-4xl">
            {isGroupMode
              ? `Reminders for ${contextLabel}`
              : `Reminders for ${contextLabel}`}
          </CardTitle>
          <p className="max-w-2xl text-sm text-muted-foreground">
            ScreenLantern turns resurfaced watchlist picks into a lightweight inbox so newly practical titles do not disappear back into the pile.
          </p>
        </CardHeader>
      </Card>

      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle className="text-xl">
            {unreadCount > 0
              ? `${unreadCount} unread reminder${unreadCount === 1 ? "" : "s"}`
              : "No unread reminders"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {isGroupMode
              ? `These reminders are for ${contextLabel} and only surface shared picks that still make sense for this exact room.`
              : `These reminders are for ${contextLabel} and reflect this profile's saved titles, services, and watched history.`}
          </p>
          {tuningNote ? (
            <p className="text-sm text-muted-foreground">{tuningNote}</p>
          ) : null}
        </CardHeader>
      </Card>

      {isLoading ? (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Refreshing your reminders...
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && error ? (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <Card className="bg-white/70">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">Nothing to nudge right now</p>
              <p className="mt-1">
                As ScreenLantern finds saved titles that are practical again, they will land here for this context.
              </p>
              {tuningNote ? <p className="mt-2">{tuningNote}</p> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {unreadItems.length > 0 ? (
        <section className="space-y-4" data-testid="reminder-section-unread">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" />
            <h2 className="font-display text-2xl">Unread</h2>
          </div>
          <div className="grid gap-4">
            {unreadItems.map((item) => (
              <ReminderCard
                key={item.id}
                item={item}
                onAction={handleReminderAction}
              />
            ))}
          </div>
        </section>
      ) : null}

      {readItems.length > 0 ? (
        <section className="space-y-4" data-testid="reminder-section-read">
          <div className="flex items-center gap-2">
            <CheckCheck className="h-4 w-4 text-primary" />
            <h2 className="font-display text-2xl">Read</h2>
          </div>
          <div className="grid gap-4">
            {readItems.map((item) => (
              <ReminderCard
                key={item.id}
                item={item}
                onAction={handleReminderAction}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReminderCard({
  item,
  onAction,
}: {
  item: ReminderItem;
  onAction: (reminderId: string, action: "read" | "dismiss") => Promise<void>;
}) {
  const [isWorking, setIsWorking] = useState<"read" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: "read" | "dismiss") {
    setIsWorking(action);
    setError(null);

    try {
      await onAction(item.id, action);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update reminder.",
      );
    } finally {
      setIsWorking(null);
    }
  }

  return (
    <Card
      className="bg-white/80"
      data-testid={`reminder-card-${item.title.mediaType}-${item.title.tmdbId}`}
    >
      <CardContent className="p-4">
        <div className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
          <Link href={item.href} className="block">
            <TitlePoster
              title={item.title.title}
              posterPath={item.title.posterPath}
              className="max-w-[120px]"
            />
          </Link>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{categoryLabel(item)}</Badge>
              <Badge variant="outline">{item.contextLabel}</Badge>
              <Badge variant="outline">{formatReleaseYear(item.title.releaseDate)}</Badge>
              <Badge variant="outline">{formatRuntime(item.title.runtimeMinutes)}</Badge>
              {item.badges?.map((badge) => (
                <Badge key={badge} variant="default">
                  {badge}
                </Badge>
              ))}
            </div>

            <div>
              <Link href={item.href}>
                <h3 className="font-display text-2xl leading-tight">
                  {item.title.title}
                </h3>
              </Link>
              <p className="mt-2 text-sm font-medium text-primary">{item.summary}</p>
              {item.detail ? (
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
              ) : null}
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {item.title.overview}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {item.title.genres.slice(0, 3).map((genre) => (
                <Badge key={genre} variant="outline">
                  {genre}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="sm">
                <Link href={item.href}>Open title</Link>
              </Button>
              {!item.isRead ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(isWorking)}
                  onClick={() => void runAction("read")}
                >
                  {isWorking === "read" ? "Saving..." : "Mark read"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={Boolean(isWorking)}
                onClick={() => void runAction("dismiss")}
              >
                <X className="mr-2 h-4 w-4" />
                {isWorking === "dismiss" ? "Dismissing..." : "Dismiss"}
              </Button>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
