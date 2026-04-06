"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TraktConnectionSummary, TraktSyncResult } from "@/lib/types";

interface TraktIntegrationFormProps {
  summary: TraktConnectionSummary;
  notice?: {
    type: "success" | "error";
    message: string;
  } | null;
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Never synced";
  }

  return new Date(value).toLocaleString();
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

export function TraktIntegrationForm({
  summary,
  notice = null,
}: TraktIntegrationFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
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
          Link Trakt to import your personal watched history, ratings, and watchlist.
          ScreenLantern keeps that data personal to this profile and does not turn it
          into shared household state automatically.
        </p>

        <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm">
          <p className="font-medium text-foreground" data-testid="trakt-connection-status">
            {summary.isConnected
              ? `Connected${summary.traktUsername ? ` as ${summary.traktUsername}` : ""}`
              : "Not connected"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Last sync: {formatTimestamp(summary.lastSyncedAt)}
          </p>
          {summary.lastSyncStatus ? (
            <p className="mt-1 text-muted-foreground">
              Last status: {summary.lastSyncStatus.replaceAll("_", " ").toLowerCase()}
            </p>
          ) : null}
          {summary.lastSyncError ? (
            <p className="mt-2 text-destructive">{summary.lastSyncError}</p>
          ) : null}
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

        {!summary.isAvailable ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            Add <code>TRAKT_CLIENT_ID</code> and <code>TRAKT_CLIENT_SECRET</code> to
            enable real Trakt linking in this environment.
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

        <div
          className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground"
          data-testid="trakt-recommendation-impact"
        >
          <p className="font-medium text-foreground">How imports affect recommendations</p>
          <ul className="mt-2 space-y-2">
            <li>Imported watched history helps ScreenLantern avoid resurfacing titles you have already seen.</li>
            <li>Imported ratings shape your personal recommendation profile without turning those signals into group taste automatically.</li>
            <li>Imported watchlist titles feed your personal reminders, resurfacing lanes, and Library decision surfaces.</li>
          </ul>
        </div>

        <div
          className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground"
          data-testid="trakt-import-rules"
        >
          <p className="font-medium text-foreground">Import rules</p>
          <ul className="mt-2 space-y-2">
            <li>Manual ScreenLantern actions stay authoritative over imported Trakt state.</li>
            <li>Sync only updates personal watched, watchlist, and taste inputs for the connected user.</li>
            <li>Disconnecting Trakt stops future syncs but keeps already imported personal data unless you clear it from a title detail page or change it manually.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
