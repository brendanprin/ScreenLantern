#!/usr/bin/env node

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { readNetflixSyncConfig, runNetflixSync } from "./netflix";
import type { NetflixSyncResult, NetflixSyncError } from "./netflix";

const PORT = Number(process.env.STREAMING_SYNC_PORT ?? 7331);
const INTERVAL_HOURS = Number(process.env.NETFLIX_SYNC_INTERVAL_HOURS ?? 24);
const STATE_DIR = process.env.NETFLIX_SYNC_USER_DATA_DIR
  ? path.dirname(process.env.NETFLIX_SYNC_USER_DATA_DIR)
  : path.resolve(".netflix-sync");
const STATE_FILE = path.join(STATE_DIR, "sync-state.json");

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
  intervalHours: number;
}

let state: SyncState = {
  status: "idle",
  lastSyncStartedAt: null,
  lastSyncCompletedAt: null,
  lastResult: null,
  lastError: null,
  nextScheduledAt: null,
  intervalHours: INTERVAL_HOURS,
};

let syncRunning = false;

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    state = { ...state, ...JSON.parse(raw) };
    state.status = state.status === "running" ? "idle" : state.status;
    state.intervalHours = INTERVAL_HOURS;
  } catch {
    // no persisted state yet
  }
}

async function saveState() {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error("[streaming-sync] Failed to save state:", error);
  }
}

function computeNextScheduled(): string | null {
  if (INTERVAL_HOURS <= 0) {
    return null;
  }

  const base = state.lastSyncCompletedAt
    ? new Date(state.lastSyncCompletedAt)
    : new Date();

  return new Date(base.getTime() + INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
}

async function runSync() {
  if (syncRunning) {
    return;
  }

  syncRunning = true;
  state.status = "running";
  state.lastSyncStartedAt = new Date().toISOString();
  await saveState();

  console.log("[streaming-sync] Netflix sync started.");

  try {
    const config = readNetflixSyncConfig();
    const outcome: NetflixSyncResult | NetflixSyncError = await runNetflixSync(config);

    if (outcome.ok) {
      state.status = "success";
      state.lastSyncCompletedAt = new Date().toISOString();
      state.lastResult = {
        imported: outcome.result.imported,
        alreadyPresent: outcome.result.alreadyPresent,
        unmatched: outcome.result.unmatched,
        scanned: outcome.result.scanned,
        summary: outcome.summary,
      };
      state.lastError = null;
      console.log(`[streaming-sync] Netflix sync complete: ${outcome.summary}`);
    } else {
      state.status = "error";
      state.lastSyncCompletedAt = new Date().toISOString();
      state.lastError = outcome.error;
      console.error(`[streaming-sync] Netflix sync failed: ${outcome.error}`);
    }
  } catch (error) {
    state.status = "error";
    state.lastSyncCompletedAt = new Date().toISOString();
    state.lastError =
      error instanceof Error ? error.message : "Unexpected error during Netflix sync.";
    console.error("[streaming-sync] Netflix sync threw:", state.lastError);
  } finally {
    state.nextScheduledAt = computeNextScheduled();
    syncRunning = false;
    await saveState();
  }
}

function isConfigured() {
  return !!(
    process.env.NETFLIX_SYNC_USER_EMAIL &&
    (process.env.INTERNAL_SYNC_SECRET ?? process.env.AUTH_SECRET)
  );
}

function jsonResponse(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function handleStatus(_req: IncomingMessage, res: ServerResponse) {
  jsonResponse(res, 200, {
    ok: true,
    configured: isConfigured(),
    intervalHours: INTERVAL_HOURS,
    state,
  });
}

function handleTrigger(_req: IncomingMessage, res: ServerResponse) {
  if (!isConfigured()) {
    return jsonResponse(res, 503, {
      ok: false,
      error: "NETFLIX_SYNC_USER_EMAIL or INTERNAL_SYNC_SECRET is not configured.",
    });
  }

  if (syncRunning) {
    return jsonResponse(res, 409, { ok: false, error: "Sync is already running." });
  }

  // fire and forget
  runSync().catch((error) => {
    console.error("[streaming-sync] Unhandled sync error:", error);
  });

  jsonResponse(res, 202, { ok: true, accepted: true });
}

function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  if (method === "GET" && url === "/status") {
    return handleStatus(req, res);
  }

  if (method === "POST" && url === "/trigger") {
    return handleTrigger(req, res);
  }

  jsonResponse(res, 404, { ok: false, error: "Not found." });
}

function scheduleNext() {
  if (INTERVAL_HOURS <= 0) {
    return;
  }

  const ms = INTERVAL_HOURS * 60 * 60 * 1000;
  setTimeout(async () => {
    console.log("[streaming-sync] Running scheduled Netflix sync.");
    await runSync();
    scheduleNext();
  }, ms);

  state.nextScheduledAt = computeNextScheduled();
}

async function main() {
  await loadState();

  const server = createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`[streaming-sync] Sidecar listening on port ${PORT}.`);
    if (INTERVAL_HOURS > 0) {
      console.log(`[streaming-sync] Auto-sync every ${INTERVAL_HOURS}h.`);
    } else {
      console.log("[streaming-sync] Auto-sync disabled (NETFLIX_SYNC_INTERVAL_HOURS=0).");
    }

    if (!isConfigured()) {
      console.warn(
        "[streaming-sync] NETFLIX_SYNC_USER_EMAIL or INTERNAL_SYNC_SECRET not set — sync will not run until configured.",
      );
    }
  });

  scheduleNext();
}

main().catch((error) => {
  console.error("[streaming-sync] Fatal startup error:", error);
  process.exitCode = 1;
});
