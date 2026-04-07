"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SyncState {
  status: "idle" | "running" | "success" | "error";
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastResult: {
    imported: number;
    alreadyPresent: number;
    unmatched: number;
    scanned: number;
    summary: string;
  } | null;
  lastError: string | null;
  nextScheduledAt: string | null;
}

interface NetflixSyncStatus {
  sidecarReachable: boolean;
  configured: boolean;
  intervalHours: number;
  state: SyncState | null;
}

export interface NetflixSyncFormProps {
  initialStatus: NetflixSyncStatus;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: SyncState["status"]) {
  switch (status) {
    case "running": return "Syncing…";
    case "success": return "Up to date";
    case "error": return "Last sync failed";
    default: return "Idle";
  }
}

export function NetflixSyncForm({ initialStatus }: NetflixSyncFormProps) {
  const [status, setStatus] = useState<NetflixSyncStatus>(initialStatus);
  const [isTriggerPending, setIsTriggerPending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (): Promise<NetflixSyncStatus | null> => {
    try {
      const response = await fetch("/api/integrations/netflix/status");
      const payload = (await response.json()) as NetflixSyncStatus & { ok: boolean };
      if (payload.ok) {
        setStatus(payload);
        return payload;
      }
    } catch {
      // silently ignore poll failures
    }
    return null;
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current !== null) return;
    pollingRef.current = setInterval(async () => {
      const latest = await fetchStatus();
      if (!latest || latest.state?.status !== "running") {
        stopPolling();
        setIsTriggerPending(false);
      }
    }, 3000);
  }, [fetchStatus, stopPolling]);

  useEffect(() => {
    return stopPolling;
  }, [stopPolling]);

  async function triggerSync() {
    setMessage(null);
    setIsTriggerPending(true);

    try {
      const response = await fetch("/api/integrations/netflix/sync", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string };

      if (response.status === 409) {
        setMessage({ type: "error", text: "Sync is already running." });
        setIsTriggerPending(false);
        return;
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not trigger sync.");
      }

      // sync accepted — start polling for completion
      await fetchStatus();
      startPolling();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not trigger sync.",
      });
      setIsTriggerPending(false);
    }
  }

  const isRunning = status.state?.status === "running" || isTriggerPending;

  if (!status.sidecarReachable) {
    return (
      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle>Netflix history sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Automatically import your Netflix viewing history into ScreenLantern.
          </p>
          <div className="rounded-2xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            <p>
              Set <code>STREAMING_SYNC_URL</code> to enable the Netflix sync sidecar. In Docker
              Compose this is <code>http://streaming-sync:7331</code>.
            </p>
            <p className="mt-2">
              Run <code>npm run netflix:setup</code> once to save your Netflix login session, then
              bring the stack up with <code>npm run docker:dev:up</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80">
      <CardHeader>
        <CardTitle>Netflix history sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Automatically import your Netflix viewing history into ScreenLantern as personal watched
          history. Imported titles are tagged so you can distinguish them from manual actions.
        </p>

        <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm space-y-1">
          <p className="font-medium text-foreground">
            {status.configured ? "Sidecar connected" : "Sidecar reachable but not configured"}
          </p>
          {status.state ? (
            <>
              <p className="text-muted-foreground">
                Status: {statusLabel(status.state.status)}
              </p>
              <p className="text-muted-foreground">
                Last sync: {formatTimestamp(status.state.lastSyncCompletedAt)}
              </p>
              {status.intervalHours > 0 ? (
                <p className="text-muted-foreground">
                  Next scheduled: {formatTimestamp(status.state.nextScheduledAt)}
                  {" "}(every {status.intervalHours}h)
                </p>
              ) : (
                <p className="text-muted-foreground">Auto-sync is off — manual only.</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No sync has run yet.</p>
          )}
        </div>

        {status.state?.lastResult ? (
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Last sync result</p>
            <p className="mt-2">{status.state.lastResult.summary}</p>
          </div>
        ) : null}

        {status.state?.lastError ? (
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Last error</p>
            <p className="mt-2 text-destructive">{status.state.lastError}</p>
          </div>
        ) : null}

        {!status.configured ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            Set <code>NETFLIX_SYNC_USER_EMAIL</code> and <code>INTERNAL_SYNC_SECRET</code> in your
            environment, then run <code>npm run netflix:setup</code> to save your Netflix login
            session.
          </div>
        ) : null}

        {message ? (
          <p className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-primary"}>
            {message.text}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={isRunning || !status.configured}
            onClick={triggerSync}
          >
            {isRunning ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
