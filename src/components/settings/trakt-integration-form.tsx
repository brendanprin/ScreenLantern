"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TraktConnectionSummary,
  TraktRecentImportItem,
  TraktSyncModeKey,
  TraktSyncResult,
} from "@/lib/types";

interface TraktIntegrationFormProps {
  summary: TraktConnectionSummary;
  notice?: {
    type: "success" | "error";
    message: string;
  } | null;
}

const SYNC_MODE_OPTIONS: Array<{
  value: TraktSyncModeKey;
  label: string;
  description: string;
}> = [
  {
    value: "OFF",
    label: "Off",
    description:
      "Keep Trakt imports manual only. ScreenLantern will not refresh automatically.",
  },
  {
    value: "DAILY",
    label: "Daily",
    description:
      "After your first sync, ScreenLantern refreshes at most once a day when you come back.",
  },
  {
    value: "ON_LOGIN_OR_APP_OPEN",
    label: "On sign in or app open",
    description:
      "Check more often when you return, but only when your imported Trakt data is getting stale.",
  },
];

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Never synced";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTimestampFallback(value?: string | null) {
  if (!value) {
    return "Never synced";
  }

  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function formatSyncSummary(result: TraktSyncResult) {
  const parts = [
    result.imported.watched > 0 ? `${result.imported.watched} watched` : null,
    result.imported.watchlist > 0 ? `${result.imported.watchlist} watchlist` : null,
    result.imported.likes > 0 ? `${result.imported.likes} likes` : null,
    result.imported.dislikes > 0 ? `${result.imported.dislikes} dislikes` : null,
  ].filter(Boolean);

  if (parts.length === 0 && result.cleared.watched === 0 && result.cleared.watchlist === 0 && result.cleared.ratings === 0) {
    return "Trakt is already in sync.";
  }

  const clearedParts = [
    result.cleared.watched > 0 ? `${result.cleared.watched} watched cleared` : null,
    result.cleared.watchlist > 0 ? `${result.cleared.watchlist} watchlist cleared` : null,
    result.cleared.ratings > 0 ? `${result.cleared.ratings} ratings cleared` : null,
  ].filter(Boolean);

  return [...parts, ...clearedParts].join(" · ");
}

function formatRecentImportLabel(item: TraktRecentImportItem) {
  switch (item.kind) {
    case "WATCHED":
      return "Watched via Trakt";
    case "WATCHLIST":
      return "Saved on Trakt watchlist";
    case "LIKE":
      return "Positive Trakt rating";
    case "DISLIKE":
      return "Negative Trakt rating";
    default:
      return "Imported from Trakt";
  }
}

export function TraktIntegrationForm({
  summary,
  notice = null,
}: TraktIntegrationFormProps) {
  const router = useRouter();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [syncMode, setSyncMode] = useState<TraktSyncModeKey>(summary.syncMode);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(
    notice
      ? {
          type: notice.type,
          text: notice.message,
        }
      : null,
  );

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  function renderTimestamp(value?: string | null) {
    return hasHydrated ? formatTimestamp(value) : formatTimestampFallback(value);
  }

  async function beginConnect() {
    setMessage(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/integrations/trakt/connect", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        authorizationUrl?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start Trakt linking.");
      }

      if (payload.authorizationUrl) {
        window.location.href = payload.authorizationUrl;
        return;
      }

      if (payload.redirectTo) {
        window.location.href = payload.redirectTo;
        return;
      }

      throw new Error("Unable to start Trakt linking.");
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to start Trakt linking.",
      });
      setIsPending(false);
    }
  }

  async function syncNow() {
    setMessage(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/integrations/trakt/sync", {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        result?: TraktSyncResult;
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Unable to sync Trakt right now.");
      }

      setMessage({
        type: "success",
        text: formatSyncSummary(payload.result),
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to sync Trakt right now.",
      });
    } finally {
      setIsPending(false);
    }
  }

  async function saveSyncMode() {
    setMessage(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/settings/trakt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          syncMode,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save Trakt sync freshness.");
      }

      setMessage({
        type: "success",
        text: "Trakt sync freshness saved.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save Trakt sync freshness.",
      });
    } finally {
      setIsPending(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Trakt? Imported data already in ScreenLantern will stay in your personal profile.")) {
      return;
    }

    setMessage(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/integrations/trakt/disconnect", {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to disconnect Trakt.");
      }

      setMessage({
        type: "success",
        text: "Trakt disconnected. Imported personal history already in ScreenLantern was kept.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Unable to disconnect Trakt.",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="bg-white/80" data-testid="trakt-integration-card">
      <CardHeader>
        <CardTitle>Trakt integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Import your personal watched history, ratings, and watchlist from Trakt.
          Imported data stays personal to this profile unless you explicitly share
          something elsewhere in ScreenLantern.
        </p>

        <details className="rounded-2xl border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
          <summary className="cursor-pointer list-none font-medium text-foreground transition hover:text-primary">
            What to know about Trakt imports
          </summary>
          <div className="mt-3 space-y-4">
            <div data-testid="trakt-recommendation-impact">
              <p className="font-medium text-foreground">How imports affect recommendations</p>
              <ul className="mt-2 space-y-2">
                <li>Imported watched history helps ScreenLantern avoid resurfacing titles you have already seen.</li>
                <li>Imported ratings shape your personal recommendation profile without turning those signals into group taste automatically.</li>
                <li>Imported watchlist titles feed your personal reminders, resurfacing lanes, and Library decision surfaces.</li>
              </ul>
            </div>

            <div data-testid="trakt-import-rules">
              <p className="font-medium text-foreground">Import rules</p>
              <ul className="mt-2 space-y-2">
                <li>Manual ScreenLantern actions stay authoritative over imported Trakt state.</li>
                <li>Sync only updates personal watched, watchlist, and taste inputs for the connected user.</li>
                <li>Disconnecting Trakt stops future syncs but keeps already imported personal data unless you clear it from a title detail page or change it manually.</li>
              </ul>
            </div>
          </div>
        </details>

        <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm">
          <p className="font-medium text-foreground" data-testid="trakt-connection-status">
            {summary.isConnected
              ? `Connected${summary.traktUsername ? ` as ${summary.traktUsername}` : ""}`
              : "Not connected"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Sync mode:{" "}
            {SYNC_MODE_OPTIONS.find((option) => option.value === summary.syncMode)?.label ??
              "Off"}
          </p>
          {summary.lastSyncReview?.triggerLabel ? (
            <p className="mt-1 text-muted-foreground" data-testid="trakt-last-sync-trigger">
              Last sync type: {summary.lastSyncReview.triggerLabel.toLowerCase()}
            </p>
          ) : null}
          <p className="mt-1 text-muted-foreground" data-testid="trakt-freshness-state">
            Freshness: {summary.freshnessState.replaceAll("_", " ").toLowerCase()}.
          </p>
          <p className="mt-1 text-muted-foreground">{summary.freshnessMessage}</p>
          <p className="mt-2 text-muted-foreground">
            Last successful sync: {renderTimestamp(summary.lastSyncedAt)}
          </p>
          <p className="mt-1 text-muted-foreground">
            Last attempt: {renderTimestamp(summary.lastSyncAttemptedAt)}
          </p>
          <p className="mt-3 text-muted-foreground">
            Imports: {summary.importedScopes.join(", ")}.
          </p>
          <p
            className="mt-2 text-muted-foreground"
            data-testid="trakt-disconnect-note"
          >
            {summary.disconnectKeepsImportedData
              ? "Disconnecting Trakt stops future syncs, but imported personal data already in ScreenLantern stays until you clear or change it."
              : "Disconnecting Trakt also removes imported personal data from ScreenLantern."}
          </p>
          {summary.isMockMode ? (
            <p className="mt-2 text-muted-foreground">
              Trakt mock mode is enabled for this environment.
            </p>
          ) : null}
        </div>

        <div
          className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground"
          data-testid="trakt-sync-review"
        >
          <p className="font-medium text-foreground">Last sync review</p>
          {summary.lastSyncReview ? (
            <>
              <p
                className="mt-2 text-sm font-medium text-foreground"
                data-testid="trakt-sync-review-headline"
              >
                {summary.lastSyncReview.headline}
              </p>
              <p className="mt-1">{summary.lastSyncReview.detail}</p>
              {summary.lastSyncReview.skippedNote ? (
                <p className="mt-2">{summary.lastSyncReview.skippedNote}</p>
              ) : null}
              {summary.lastSyncReview.recentImports.length > 0 ? (
                <div className="mt-3 space-y-2" data-testid="trakt-recent-imports">
                  <p className="font-medium text-foreground">Recent imported titles</p>
                  <ul className="space-y-2">
                    {summary.lastSyncReview.recentImports.map((item) => (
                      <li key={`${item.kind}-${item.mediaType}-${item.tmdbId}`}>
                        <Link
                          href={`/app/title/${item.mediaType}/${item.tmdbId}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {item.title}
                        </Link>
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatRecentImportLabel(item)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-2">
              Run Sync now once to review the watched history, ratings, and watchlist
              changes ScreenLantern imported from Trakt.
            </p>
          )}
        </div>

        {!summary.isAvailable ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            Add <code>TRAKT_CLIENT_ID</code> and <code>TRAKT_CLIENT_SECRET</code> to
            enable real Trakt linking in this environment.
          </div>
        ) : null}

        {summary.isConnected ? (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Sync freshness</p>
            <Select
              value={syncMode}
              onValueChange={(value) => setSyncMode(value as TraktSyncModeKey)}
            >
              <SelectTrigger aria-label="Trakt sync mode">
                <SelectValue placeholder="Choose Trakt sync mode" />
              </SelectTrigger>
              <SelectContent>
                {SYNC_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {
                SYNC_MODE_OPTIONS.find((option) => option.value === syncMode)
                  ?.description
              }
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={saveSyncMode}
            >
              Save sync freshness
            </Button>
          </div>
        ) : null}

        {message ? (
          <p className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-primary"}>
            {message.text}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {!summary.isConnected ? (
            <Button type="button" disabled={isPending || !summary.isAvailable} onClick={beginConnect}>
              Connect Trakt
            </Button>
          ) : (
            <>
              <Button type="button" disabled={isPending} onClick={syncNow}>
                {isPending ? "Syncing..." : "Sync now"}
              </Button>
              <Button type="button" variant="outline" disabled={isPending} onClick={disconnect}>
                Disconnect Trakt
              </Button>
            </>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
