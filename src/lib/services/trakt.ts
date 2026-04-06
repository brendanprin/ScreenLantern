import {
  InteractionType,
  MediaType,
  Prisma,
  SourceContext,
  TraktSyncMode,
  TraktSyncStatus,
  TraktSyncTrigger,
} from "@prisma/client";

import { env } from "@/lib/env";
import {
  getMockTraktActivities,
  getMockTraktProfile,
  getMockTraktRatedItems,
  getMockTraktWatchlistItems,
  getMockTraktWatchedItems,
  type MockTraktActivitySet,
  type MockTraktTitleItem,
} from "@/lib/mock-trakt";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/token-crypto";
import { getTitleDetails } from "@/lib/services/catalog";
import { upsertTitleCache } from "@/lib/services/title-cache";
import type {
  MediaTypeKey,
  TraktConnectionSummary,
  TraktAutoSyncResult,
  TraktFreshnessStateKey,
  TraktLastSyncSummary,
  TraktRecentImportItem,
  TraktRecentImportKind,
  TraktSyncReview,
  TraktSyncModeKey,
  TraktSyncResult,
  TraktSyncTriggerKey,
} from "@/lib/types";

const TRAKT_AUTHORIZE_URL = "https://trakt.tv/oauth/authorize";
const TRAKT_TOKEN_URL = "https://api.trakt.tv/oauth/token";
const TRAKT_REVOKE_URL = "https://api.trakt.tv/oauth/revoke";
const TRAKT_API_BASE_URL = "https://api.trakt.tv";
export const TRAKT_OAUTH_STATE_COOKIE = "screenlantern-trakt-oauth-state";
export const TRAKT_POSITIVE_RATING_MIN = 7;
export const TRAKT_NEGATIVE_RATING_MAX = 4;
export const TRAKT_DAILY_SYNC_STALE_HOURS = 24;
export const TRAKT_APP_OPEN_SYNC_STALE_HOURS = 6;
export const TRAKT_AUTO_SYNC_FAILURE_BACKOFF_HOURS = 3;

interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at?: number;
  scope?: string;
  token_type?: string;
}

interface TraktViewerProfile {
  username?: string | null;
  ids?: {
    slug?: string | null;
    trakt?: number | string | null;
  };
}

interface TraktLastActivities {
  movies?: {
    watched_at?: string | null;
    rated_at?: string | null;
    watchlisted_at?: string | null;
  };
  shows?: {
    watched_at?: string | null;
    rated_at?: string | null;
    watchlisted_at?: string | null;
  };
  episodes?: {
    watched_at?: string | null;
  };
}

interface TraktMovieEnvelope {
  watched_at?: string | null;
  listed_at?: string | null;
  rated_at?: string | null;
  rating?: number | null;
  movie?: {
    title?: string | null;
    year?: number | null;
    ids?: {
      tmdb?: number | null;
    };
  };
}

interface TraktShowEnvelope {
  watched_at?: string | null;
  listed_at?: string | null;
  rated_at?: string | null;
  rating?: number | null;
  show?: {
    title?: string | null;
    year?: number | null;
    ids?: {
      tmdb?: number | null;
    };
  };
}

export interface TraktSyncPlan {
  watchedMovies: boolean;
  watchedShows: boolean;
  ratingsMovies: boolean;
  ratingsShows: boolean;
  watchlistMovies: boolean;
  watchlistShows: boolean;
}

interface TraktFreshnessInput {
  syncMode: TraktSyncModeKey;
  lastSyncedAt?: Date | null;
  lastSyncStatus?: TraktSyncStatus | null;
  now?: Date;
}

interface TraktAutoSyncInput extends TraktFreshnessInput {
  lastSyncAttemptedAt?: Date | null;
}

function hoursToMs(hours: number) {
  return hours * 60 * 60 * 1000;
}

function getTraktFreshnessWindowMs(mode: TraktSyncModeKey) {
  if (mode === "ON_LOGIN_OR_APP_OPEN") {
    return hoursToMs(TRAKT_APP_OPEN_SYNC_STALE_HOURS);
  }

  return hoursToMs(TRAKT_DAILY_SYNC_STALE_HOURS);
}

function wasRecentlyAttempted(attemptedAt?: Date | null, now = new Date()) {
  if (!attemptedAt) {
    return false;
  }

  return (
    now.getTime() - attemptedAt.getTime() <
    hoursToMs(TRAKT_AUTO_SYNC_FAILURE_BACKOFF_HOURS)
  );
}

export function getTraktFreshnessState(args: TraktFreshnessInput): {
  state: TraktFreshnessStateKey;
  message: string;
} {
  const now = args.now ?? new Date();

  if (!args.lastSyncedAt) {
    if (args.syncMode === "DAILY") {
      return {
        state: "NEVER_SYNCED",
        message:
          "Run Sync now once, then ScreenLantern can keep your Trakt data fresh each day.",
      };
    }

    if (args.syncMode === "ON_LOGIN_OR_APP_OPEN") {
      return {
        state: "NEVER_SYNCED",
        message:
          "ScreenLantern will import from Trakt the next time you sign in or reopen the app.",
      };
    }

    return {
      state: "NEVER_SYNCED",
      message:
        "Automatic Trakt refresh is off, so use Sync now whenever you want fresh personal history.",
    };
  }

  const isStale =
    args.lastSyncStatus === TraktSyncStatus.NEEDS_REAUTH ||
    now.getTime() - args.lastSyncedAt.getTime() > getTraktFreshnessWindowMs(args.syncMode);

  if (!isStale) {
    return {
      state: "FRESH",
      message:
        args.syncMode === "ON_LOGIN_OR_APP_OPEN"
          ? "Your Trakt data looks current for sign-in and app-open refreshes."
          : args.syncMode === "DAILY"
            ? "Your Trakt data looks current for the daily refresh window."
            : "Automatic refresh is off, and your personal Trakt import still looks current from the last sync.",
    };
  }

  return {
    state: "STALE",
    message:
      args.syncMode === "OFF"
        ? "Automatic Trakt refresh is off, so this imported data may be stale until you sync manually."
        : args.syncMode === "DAILY"
          ? "Your daily Trakt refresh is due the next time ScreenLantern can sync."
          : "ScreenLantern will try to refresh Trakt the next time you sign in or reopen the app.",
  };
}

export function shouldAutoSyncTraktConnection(args: TraktAutoSyncInput): {
  shouldSync: boolean;
  reason: TraktAutoSyncResult["reason"];
} {
  const now = args.now ?? new Date();

  if (args.syncMode === "OFF") {
    return { shouldSync: false, reason: "disabled" };
  }

  if (args.lastSyncStatus === TraktSyncStatus.NEEDS_REAUTH) {
    return { shouldSync: false, reason: "needs_reauth" };
  }

  if (!args.lastSyncedAt) {
    if (args.syncMode === "DAILY") {
      return { shouldSync: false, reason: "manual_bootstrap_required" };
    }

    if (wasRecentlyAttempted(args.lastSyncAttemptedAt, now)) {
      return { shouldSync: false, reason: "backoff" };
    }

    return { shouldSync: true, reason: "never_synced" };
  }

  const freshness = getTraktFreshnessState(args);

  if (freshness.state !== "STALE") {
    return { shouldSync: false, reason: "fresh_enough" };
  }

  if (
    args.lastSyncStatus === TraktSyncStatus.ERROR &&
    wasRecentlyAttempted(args.lastSyncAttemptedAt, now)
  ) {
    return { shouldSync: false, reason: "backoff" };
  }

  return { shouldSync: true, reason: "stale" };
}

function traktConfigured() {
  return Boolean(env.traktUseMockData || (env.traktClientId && env.traktClientSecret));
}

function buildTraktHeaders(accessToken?: string) {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "ScreenLantern/0.1",
    "trakt-api-version": "2",
  });

  if (env.traktClientId) {
    headers.set("trakt-api-key", env.traktClientId);
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return headers;
}

function buildTraktOauthHeaders() {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "ScreenLantern/0.1",
  });

  if (env.traktClientId) {
    headers.set("trakt-api-key", env.traktClientId);
  }

  return headers;
}

function getTokenExpiresAt(payload: TraktTokenResponse) {
  const createdAtMs = payload.created_at ? payload.created_at * 1000 : Date.now();
  return new Date(createdAtMs + payload.expires_in * 1000);
}

function safeIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function normalizeTraktSyncTrigger(
  trigger?: "manual" | "auto" | "internal" | null,
): TraktSyncTriggerKey {
  return trigger === "manual" ? "MANUAL" : "AUTOMATIC";
}

function buildRecentImportTimestamp(item: MockTraktTitleItem, kind: TraktRecentImportKind) {
  if (kind === "WATCHED") {
    return item.watchedAt ?? null;
  }

  if (kind === "WATCHLIST") {
    return item.watchlistedAt ?? null;
  }

  return item.ratedAt ?? null;
}

async function readTraktErrorDetail(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        error?: string;
        error_description?: string;
      };

      return [payload.error_description, payload.error].filter(Boolean).join(" ").trim();
    }

    const text = (await response.text()).trim();
    if (/<\/?[a-z][\s\S]*>/i.test(text)) {
      return text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    return text;
  } catch {
    return "";
  }
}

function buildTraktExchangeFailureMessage(detail: string) {
  const normalized = detail.trim();
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return "Unable to complete the Trakt authorization exchange.";
  }

  if (lower.includes("redirect uri")) {
    return "Trakt rejected the callback URL. Check that TRAKT_REDIRECT_URI exactly matches the redirect URI saved in your Trakt app.";
  }

  if (lower.includes("cloudflare") || lower.includes("you have been blocked")) {
    return "Trakt blocked the server-side token exchange from this environment. This is usually a Cloudflare or network reputation issue outside ScreenLantern. Try again from a different network or host, or use TRAKT_USE_MOCK_DATA=1 for local testing.";
  }

  if (lower.includes("invalid_client") || lower.includes("client secret")) {
    return "Trakt rejected this app's credentials. Check TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.";
  }

  if (lower.includes("invalid_grant") || lower.includes("authorization code")) {
    return "Trakt rejected the one-time authorization code. Try connecting again. If it keeps failing, verify your Trakt client secret and redirect URI.";
  }

  return `Unable to complete the Trakt authorization exchange. ${normalized}`;
}

function buildTraktRefreshFailureMessage(detail: string) {
  const normalized = detail.trim();
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return "Unable to refresh the Trakt access token.";
  }

  if (lower.includes("invalid_grant") || lower.includes("invalid_token")) {
    return "Trakt refresh failed and this connection needs to be reconnected.";
  }

  if (lower.includes("cloudflare") || lower.includes("you have been blocked")) {
    return "Trakt blocked the server-side token refresh from this environment. Reconnect later from a different network or host if this keeps happening.";
  }

  if (lower.includes("invalid_client") || lower.includes("client secret")) {
    return "Trakt refresh failed because this app's credentials are not being accepted. Check TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET.";
  }

  return `Unable to refresh the Trakt access token. ${normalized}`;
}

function buildRecentImportItem(
  item: MockTraktTitleItem,
  kind: TraktRecentImportKind,
): TraktRecentImportItem {
  return {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    kind,
    importedAt: buildRecentImportTimestamp(item, kind),
  };
}

function compareRecentImportItems(
  left: TraktRecentImportItem,
  right: TraktRecentImportItem,
) {
  const leftTime = left.importedAt ? Date.parse(left.importedAt) : 0;
  const rightTime = right.importedAt ? Date.parse(right.importedAt) : 0;

  return rightTime - leftTime;
}

function summarizeCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatJoinedSummary(parts: string[]) {
  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0]!;
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function parseStoredSyncSummary(json: Prisma.JsonValue | null): TraktLastSyncSummary | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return null;
  }

  const value = json as Record<string, unknown>;
  const imported = value.imported;
  const cleared = value.cleared;
  const recentImports = Array.isArray(value.recentImports) ? value.recentImports : [];

  if (
    !imported ||
    typeof imported !== "object" ||
    !cleared ||
    typeof cleared !== "object"
  ) {
    return null;
  }

  const normalizedRecentImports: TraktRecentImportItem[] = [];

  for (const item of recentImports) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const preview = item as Record<string, unknown>;
    const kind = preview.kind;
    const mediaType = preview.mediaType;
    const title = preview.title;
    const tmdbId = preview.tmdbId;

    if (
      typeof tmdbId !== "number" ||
      (kind !== "WATCHED" &&
        kind !== "WATCHLIST" &&
        kind !== "LIKE" &&
        kind !== "DISLIKE") ||
      (mediaType !== "movie" && mediaType !== "tv") ||
      typeof title !== "string"
    ) {
      continue;
    }

    normalizedRecentImports.push({
      tmdbId,
      mediaType,
      title,
      kind,
      importedAt: typeof preview.importedAt === "string" ? preview.importedAt : null,
    });
  }

  return {
    trigger:
      value.trigger === "MANUAL" || value.trigger === "AUTOMATIC"
        ? value.trigger
        : "MANUAL",
    changed: value.changed === true,
    imported: {
      watched:
        typeof (imported as Record<string, unknown>).watched === "number"
          ? ((imported as Record<string, unknown>).watched as number)
          : 0,
      watchlist:
        typeof (imported as Record<string, unknown>).watchlist === "number"
          ? ((imported as Record<string, unknown>).watchlist as number)
          : 0,
      likes:
        typeof (imported as Record<string, unknown>).likes === "number"
          ? ((imported as Record<string, unknown>).likes as number)
          : 0,
      dislikes:
        typeof (imported as Record<string, unknown>).dislikes === "number"
          ? ((imported as Record<string, unknown>).dislikes as number)
          : 0,
    },
    cleared: {
      watched:
        typeof (cleared as Record<string, unknown>).watched === "number"
          ? ((cleared as Record<string, unknown>).watched as number)
          : 0,
      watchlist:
        typeof (cleared as Record<string, unknown>).watchlist === "number"
          ? ((cleared as Record<string, unknown>).watchlist as number)
          : 0,
      ratings:
        typeof (cleared as Record<string, unknown>).ratings === "number"
          ? ((cleared as Record<string, unknown>).ratings as number)
          : 0,
    },
    skippedWithoutTmdb:
      typeof value.skippedWithoutTmdb === "number" ? value.skippedWithoutTmdb : 0,
    recentImports: normalizedRecentImports,
  };
}

function buildTraktSuccessReview(summary: TraktLastSyncSummary): TraktSyncReview {
  const ratingCount = summary.imported.likes + summary.imported.dislikes;
  const importedParts = [
    summary.imported.watched > 0
      ? summarizeCount(summary.imported.watched, "watched title")
      : null,
    summary.imported.watchlist > 0
      ? summarizeCount(summary.imported.watchlist, "watchlist item")
      : null,
    ratingCount > 0 ? summarizeCount(ratingCount, "rating") : null,
  ].filter(Boolean) as string[];

  const clearedParts = [
    summary.cleared.watched > 0
      ? summarizeCount(summary.cleared.watched, "watched import")
      : null,
    summary.cleared.watchlist > 0
      ? summarizeCount(summary.cleared.watchlist, "watchlist import")
      : null,
    summary.cleared.ratings > 0
      ? summarizeCount(summary.cleared.ratings, "rating signal")
      : null,
  ].filter(Boolean) as string[];

  if (!summary.changed) {
    return {
      state: "no_changes",
      triggerLabel:
        summary.trigger === "MANUAL" ? "Manual sync" : "Automatic sync",
      headline: "No new Trakt changes found.",
      detail:
        "ScreenLantern did not need to update your imported watched history, ratings, or watchlist on the last sync.",
      skippedNote:
        summary.skippedWithoutTmdb > 0
          ? `Skipped ${summarizeCount(summary.skippedWithoutTmdb, "title")} that ScreenLantern could not match cleanly yet.`
          : null,
      recentImports: [],
    };
  }

  let headline = "Updated your imported Trakt state.";

  if (importedParts.length > 0) {
    headline = `Imported ${formatJoinedSummary(importedParts)}.`;
  } else if (clearedParts.length > 0) {
    headline = "Updated your imported Trakt state to match Trakt.";
  }

  const detailParts = [
    clearedParts.length > 0
      ? `Removed ${formatJoinedSummary(clearedParts)} that are no longer on Trakt.`
      : null,
  ].filter(Boolean) as string[];

  return {
    state: "success",
    triggerLabel: summary.trigger === "MANUAL" ? "Manual sync" : "Automatic sync",
    headline,
    detail:
      detailParts[0] ??
      "Imported personal watched history, ratings, and watchlist changes now feed your solo recommendations and reminders.",
    skippedNote:
      summary.skippedWithoutTmdb > 0
        ? `Skipped ${summarizeCount(summary.skippedWithoutTmdb, "title")} that ScreenLantern could not match cleanly yet.`
        : null,
    recentImports: summary.recentImports,
  };
}

export function buildTraktSyncReview(args: {
  lastSyncStatus?: TraktSyncStatus | null;
  lastSyncError?: string | null;
  lastSyncTrigger?: TraktSyncTriggerKey | null;
  lastSyncSummary?: TraktLastSyncSummary | null;
}): TraktSyncReview | null {
  if (!args.lastSyncStatus && !args.lastSyncSummary) {
    return null;
  }

  if (
    args.lastSyncStatus === TraktSyncStatus.ERROR ||
    args.lastSyncStatus === TraktSyncStatus.NEEDS_REAUTH
  ) {
    return {
      state: "failed",
      triggerLabel:
        args.lastSyncTrigger === "MANUAL" ? "Manual sync" : "Automatic sync",
      headline:
        args.lastSyncStatus === TraktSyncStatus.NEEDS_REAUTH
          ? "Sync failed. Reconnect Trakt to continue."
          : "Sync failed. Try again in a moment.",
      detail:
        args.lastSyncStatus === TraktSyncStatus.NEEDS_REAUTH
          ? "ScreenLantern could not refresh your Trakt access, so imported watched history and ratings may stop updating until you reconnect."
          : "Your existing imported data is still safe, but ScreenLantern could not refresh it on the last attempt.",
      skippedNote: null,
      recentImports: [],
    };
  }

  if (args.lastSyncSummary) {
    return buildTraktSuccessReview(args.lastSyncSummary);
  }

  return null;
}

function compareActivityTimestamps(current?: string | null, previous?: string | null) {
  if (!previous) {
    return Boolean(current);
  }

  return Boolean(current && current !== previous);
}

function hasAnyActivity(payload: TraktLastActivities | null) {
  return Boolean(
    payload?.movies?.watched_at ||
      payload?.movies?.rated_at ||
      payload?.movies?.watchlisted_at ||
      payload?.shows?.watched_at ||
      payload?.shows?.rated_at ||
      payload?.shows?.watchlisted_at ||
      payload?.episodes?.watched_at,
  );
}

export function buildTraktAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.traktClientId ?? "mock-trakt-client",
    redirect_uri: env.traktRedirectUri,
    state,
  });

  return `${TRAKT_AUTHORIZE_URL}?${params.toString()}`;
}

export function mapTraktRatingToInteraction(rating?: number | null) {
  if (typeof rating !== "number") {
    return null;
  }

  if (rating >= TRAKT_POSITIVE_RATING_MIN) {
    return InteractionType.LIKE;
  }

  if (rating <= TRAKT_NEGATIVE_RATING_MAX) {
    return InteractionType.DISLIKE;
  }

  return null;
}

export function determineTraktSyncPlan(args: {
  currentActivities: TraktLastActivities | null;
  previousActivities: TraktLastActivities | null;
}) : TraktSyncPlan {
  if (!args.previousActivities || !hasAnyActivity(args.previousActivities)) {
    return {
      watchedMovies: true,
      watchedShows: true,
      ratingsMovies: true,
      ratingsShows: true,
      watchlistMovies: true,
      watchlistShows: true,
    };
  }

  return {
    watchedMovies: compareActivityTimestamps(
      args.currentActivities?.movies?.watched_at,
      args.previousActivities.movies?.watched_at,
    ),
    watchedShows:
      compareActivityTimestamps(
        args.currentActivities?.shows?.watched_at,
        args.previousActivities.shows?.watched_at,
      ) ||
      compareActivityTimestamps(
        args.currentActivities?.episodes?.watched_at,
        args.previousActivities.episodes?.watched_at,
      ),
    ratingsMovies: compareActivityTimestamps(
      args.currentActivities?.movies?.rated_at,
      args.previousActivities.movies?.rated_at,
    ),
    ratingsShows: compareActivityTimestamps(
      args.currentActivities?.shows?.rated_at,
      args.previousActivities.shows?.rated_at,
    ),
    watchlistMovies: compareActivityTimestamps(
      args.currentActivities?.movies?.watchlisted_at,
      args.previousActivities.movies?.watchlisted_at,
    ),
    watchlistShows: compareActivityTimestamps(
      args.currentActivities?.shows?.watchlisted_at,
      args.previousActivities.shows?.watchlisted_at,
    ),
  };
}

function parseStoredActivities(json: Prisma.JsonValue | null): TraktLastActivities | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return null;
  }

  return json as unknown as TraktLastActivities;
}

async function traktFetchJson<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const response = await fetch(`${TRAKT_API_BASE_URL}${path}`, {
    headers: buildTraktHeaders(accessToken),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new Error("Trakt authorization expired. Please reconnect your account.");
  }

  if (!response.ok) {
    throw new Error(`Trakt request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function exchangeTraktCode(code: string): Promise<TraktTokenResponse> {
  if (env.traktUseMockData) {
    return {
      access_token: `mock-access-${code}`,
      refresh_token: `mock-refresh-${code}`,
      expires_in: 60 * 60 * 24,
      created_at: Math.floor(Date.now() / 1000),
      scope: "public",
      token_type: "Bearer",
    };
  }

  if (!env.traktClientId || !env.traktClientSecret) {
    throw new Error("Trakt OAuth is not configured.");
  }

  const response = await fetch(TRAKT_TOKEN_URL, {
    method: "POST",
    headers: buildTraktOauthHeaders(),
    body: JSON.stringify({
      code,
      client_id: env.traktClientId,
      client_secret: env.traktClientSecret,
      redirect_uri: env.traktRedirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(buildTraktExchangeFailureMessage(await readTraktErrorDetail(response)));
  }

  return (await response.json()) as TraktTokenResponse;
}

async function refreshTraktToken(refreshToken: string): Promise<TraktTokenResponse> {
  if (env.traktUseMockData) {
    return {
      access_token: `mock-access-refresh-${Date.now()}`,
      refresh_token: refreshToken,
      expires_in: 60 * 60 * 24,
      created_at: Math.floor(Date.now() / 1000),
      scope: "public",
      token_type: "Bearer",
    };
  }

  if (!env.traktClientId || !env.traktClientSecret) {
    throw new Error("Trakt OAuth is not configured.");
  }

  const response = await fetch(TRAKT_TOKEN_URL, {
    method: "POST",
    headers: buildTraktOauthHeaders(),
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: env.traktClientId,
      client_secret: env.traktClientSecret,
      redirect_uri: env.traktRedirectUri,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(buildTraktRefreshFailureMessage(await readTraktErrorDetail(response)));
  }

  return (await response.json()) as TraktTokenResponse;
}

async function revokeTraktToken(accessToken: string) {
  if (env.traktUseMockData || !env.traktClientId || !env.traktClientSecret) {
    return;
  }

  await fetch(TRAKT_REVOKE_URL, {
    method: "POST",
    headers: buildTraktOauthHeaders(),
    body: JSON.stringify({
      token: accessToken,
      client_id: env.traktClientId,
      client_secret: env.traktClientSecret,
    }),
  }).catch(() => null);
}

async function getTraktProfile(args: {
  email: string;
  accessToken: string;
}) {
  if (env.traktUseMockData) {
    return getMockTraktProfile(args.email);
  }

  const profile = await traktFetchJson<TraktViewerProfile>("/users/me?extended=full", args.accessToken);

  return {
    userId: profile.ids?.slug ?? String(profile.ids?.trakt ?? ""),
    username: profile.username ?? profile.ids?.slug ?? "trakt-user",
  };
}

async function getTraktLastActivities(args: {
  email: string;
  accessToken: string;
}) {
  if (env.traktUseMockData) {
    return getMockTraktActivities(args.email);
  }

  return traktFetchJson<TraktLastActivities>("/sync/last_activities", args.accessToken);
}

function mapMovieEnvelopeToImportItem(item: TraktMovieEnvelope): MockTraktTitleItem | null {
  const tmdbId = item.movie?.ids?.tmdb;

  if (!tmdbId || !item.movie?.title) {
    return null;
  }

  return {
    mediaType: "movie",
    tmdbId,
    title: item.movie.title,
    year: item.movie.year ?? null,
    watchedAt: item.watched_at ?? null,
    watchlistedAt: item.listed_at ?? null,
    ratedAt: item.rated_at ?? null,
    rating: item.rating ?? null,
  };
}

function mapShowEnvelopeToImportItem(item: TraktShowEnvelope): MockTraktTitleItem | null {
  const tmdbId = item.show?.ids?.tmdb;

  if (!tmdbId || !item.show?.title) {
    return null;
  }

  return {
    mediaType: "tv",
    tmdbId,
    title: item.show.title,
    year: item.show.year ?? null,
    watchedAt: item.watched_at ?? null,
    watchlistedAt: item.listed_at ?? null,
    ratedAt: item.rated_at ?? null,
    rating: item.rating ?? null,
  };
}

async function fetchTraktWatched(args: {
  email: string;
  accessToken: string;
  mediaType: MediaTypeKey;
}) {
  if (env.traktUseMockData) {
    return getMockTraktWatchedItems(args.email, args.mediaType);
  }

  const path =
    args.mediaType === "movie" ? "/sync/watched/movies" : "/sync/watched/shows";
  const payload = await traktFetchJson<Array<TraktMovieEnvelope | TraktShowEnvelope>>(
    path,
    args.accessToken,
  );

  return payload
    .map((item) =>
      args.mediaType === "movie"
        ? mapMovieEnvelopeToImportItem(item as TraktMovieEnvelope)
        : mapShowEnvelopeToImportItem(item as TraktShowEnvelope),
    )
    .filter((item): item is MockTraktTitleItem => Boolean(item));
}

async function fetchTraktRatings(args: {
  email: string;
  accessToken: string;
  mediaType: MediaTypeKey;
}) {
  if (env.traktUseMockData) {
    return getMockTraktRatedItems(args.email, args.mediaType);
  }

  const path =
    args.mediaType === "movie" ? "/sync/ratings/movies" : "/sync/ratings/shows";
  const payload = await traktFetchJson<Array<TraktMovieEnvelope | TraktShowEnvelope>>(
    path,
    args.accessToken,
  );

  return payload
    .map((item) =>
      args.mediaType === "movie"
        ? mapMovieEnvelopeToImportItem(item as TraktMovieEnvelope)
        : mapShowEnvelopeToImportItem(item as TraktShowEnvelope),
    )
    .filter((item): item is MockTraktTitleItem => Boolean(item));
}

async function fetchTraktWatchlist(args: {
  email: string;
  accessToken: string;
  mediaType: MediaTypeKey;
}) {
  if (env.traktUseMockData) {
    return getMockTraktWatchlistItems(args.email, args.mediaType);
  }

  const path =
    args.mediaType === "movie" ? "/sync/watchlist/movies" : "/sync/watchlist/shows";
  const payload = await traktFetchJson<Array<TraktMovieEnvelope | TraktShowEnvelope>>(
    path,
    args.accessToken,
  );

  return payload
    .map((item) =>
      args.mediaType === "movie"
        ? mapMovieEnvelopeToImportItem(item as TraktMovieEnvelope)
        : mapShowEnvelopeToImportItem(item as TraktShowEnvelope),
    )
    .filter((item): item is MockTraktTitleItem => Boolean(item));
}

async function ensureTitleCacheForImport(item: MockTraktTitleItem) {
  const existing = await prisma.titleCache.findUnique({
    where: {
      tmdbId_mediaType: {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
  });

  if (existing) {
    return existing;
  }

  const detail = await getTitleDetails(item.tmdbId, item.mediaType);

  if (detail.data) {
    return upsertTitleCache(detail.data);
  }

  const fallbackTitle = {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    overview: "Imported from Trakt.",
    posterPath: null,
    backdropPath: null,
    releaseDate: item.year ? `${item.year}-01-01` : null,
    releaseYear: item.year ?? null,
    runtimeMinutes: null,
    genres: [],
    voteAverage: null,
    popularity: null,
    providers: [],
    providerStatus: "unknown" as const,
  };

  return upsertTitleCache(fallbackTitle);
}

async function getInteractionsForTitle(
  userId: string,
  titleCacheId: string,
  interactionTypes: InteractionType[],
) {
  return prisma.userTitleInteraction.findMany({
    where: {
      userId,
      titleCacheId,
      interactionType: { in: interactionTypes },
    },
  });
}

async function ensureImportedInteraction(args: {
  userId: string;
  titleCacheId: string;
  interactionType: InteractionType;
}) {
  const existing = await prisma.userTitleInteraction.findUnique({
    where: {
      userId_titleCacheId_interactionType: {
        userId: args.userId,
        titleCacheId: args.titleCacheId,
        interactionType: args.interactionType,
      },
    },
  });

  if (existing) {
    return {
      changed: false,
      sourceContext: existing.sourceContext,
    };
  }

  await prisma.userTitleInteraction.create({
    data: {
      userId: args.userId,
      titleCacheId: args.titleCacheId,
      interactionType: args.interactionType,
      sourceContext: SourceContext.IMPORTED,
    },
  });

  return {
    changed: true,
    sourceContext: SourceContext.IMPORTED,
  };
}

async function clearImportedInteraction(args: {
  userId: string;
  titleCacheId: string;
  interactionType: InteractionType;
}) {
  const removed = await prisma.userTitleInteraction.deleteMany({
    where: {
      userId: args.userId,
      titleCacheId: args.titleCacheId,
      interactionType: args.interactionType,
      sourceContext: SourceContext.IMPORTED,
    },
  });

  return removed.count;
}

async function syncImportedWatchedCategory(args: {
  userId: string;
  mediaType: MediaTypeKey;
  items: MockTraktTitleItem[];
}) {
  const currentImported = await prisma.userTitleInteraction.findMany({
    where: {
      userId: args.userId,
      interactionType: InteractionType.WATCHED,
      sourceContext: SourceContext.IMPORTED,
      title: {
        mediaType: args.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
    include: {
      title: {
        select: {
          id: true,
          tmdbId: true,
          mediaType: true,
        },
      },
    },
  });

  const incomingIds = new Set<string>();
  let imported = 0;
  let skippedWithoutTmdb = 0;
  const recentImports: TraktRecentImportItem[] = [];

  for (const item of args.items) {
    if (!item.tmdbId) {
      skippedWithoutTmdb += 1;
      continue;
    }

    const cachedTitle = await ensureTitleCacheForImport(item);
    incomingIds.add(cachedTitle.id);
    const existing = await prisma.userTitleInteraction.findUnique({
      where: {
        userId_titleCacheId_interactionType: {
          userId: args.userId,
          titleCacheId: cachedTitle.id,
          interactionType: InteractionType.WATCHED,
        },
      },
    });

    if (existing?.sourceContext && existing.sourceContext !== SourceContext.IMPORTED) {
      continue;
    }

    const result = await ensureImportedInteraction({
      userId: args.userId,
      titleCacheId: cachedTitle.id,
      interactionType: InteractionType.WATCHED,
    });

    if (result.changed) {
      imported += 1;
      recentImports.push(buildRecentImportItem(item, "WATCHED"));
    }
  }

  let cleared = 0;

  for (const interaction of currentImported) {
    if (!incomingIds.has(interaction.title.id)) {
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: interaction.title.id,
        interactionType: InteractionType.WATCHED,
      });
    }
  }

  return {
    imported,
    cleared,
    skippedWithoutTmdb,
    recentImports,
  };
}

async function syncImportedWatchlistCategory(args: {
  userId: string;
  mediaType: MediaTypeKey;
  items: MockTraktTitleItem[];
}) {
  const currentImported = await prisma.userTitleInteraction.findMany({
    where: {
      userId: args.userId,
      interactionType: InteractionType.WATCHLIST,
      sourceContext: SourceContext.IMPORTED,
      title: {
        mediaType: args.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
    include: {
      title: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  const incomingIds = new Set<string>();
  let imported = 0;
  let skippedWithoutTmdb = 0;
  const recentImports: TraktRecentImportItem[] = [];

  for (const item of args.items) {
    if (!item.tmdbId) {
      skippedWithoutTmdb += 1;
      continue;
    }

    const cachedTitle = await ensureTitleCacheForImport(item);
    incomingIds.add(cachedTitle.id);
    const existing = await getInteractionsForTitle(args.userId, cachedTitle.id, [
      InteractionType.WATCHLIST,
      InteractionType.WATCHED,
      InteractionType.HIDE,
    ]);
    const watchlistInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.WATCHLIST,
    );
    const watchedInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.WATCHED,
    );
    const hiddenInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.HIDE,
    );

    if (watchedInteraction || (hiddenInteraction && hiddenInteraction.sourceContext !== SourceContext.IMPORTED)) {
      continue;
    }

    if (watchlistInteraction?.sourceContext && watchlistInteraction.sourceContext !== SourceContext.IMPORTED) {
      continue;
    }

    const result = await ensureImportedInteraction({
      userId: args.userId,
      titleCacheId: cachedTitle.id,
      interactionType: InteractionType.WATCHLIST,
    });

    if (result.changed) {
      imported += 1;
      recentImports.push(buildRecentImportItem(item, "WATCHLIST"));
    }
  }

  let cleared = 0;

  for (const interaction of currentImported) {
    if (!incomingIds.has(interaction.title.id)) {
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: interaction.title.id,
        interactionType: InteractionType.WATCHLIST,
      });
    }
  }

  return {
    imported,
    cleared,
    skippedWithoutTmdb,
    recentImports,
  };
}

async function syncImportedRatingsCategory(args: {
  userId: string;
  mediaType: MediaTypeKey;
  items: MockTraktTitleItem[];
}) {
  const currentImported = await prisma.userTitleInteraction.findMany({
    where: {
      userId: args.userId,
      sourceContext: SourceContext.IMPORTED,
      interactionType: {
        in: [InteractionType.LIKE, InteractionType.DISLIKE],
      },
      title: {
        mediaType: args.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
    include: {
      title: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  const incomingIds = new Set<string>();
  let importedLikes = 0;
  let importedDislikes = 0;
  let cleared = 0;
  let skippedWithoutTmdb = 0;
  const recentImports: TraktRecentImportItem[] = [];

  for (const item of args.items) {
    if (!item.tmdbId) {
      skippedWithoutTmdb += 1;
      continue;
    }

    const cachedTitle = await ensureTitleCacheForImport(item);
    incomingIds.add(cachedTitle.id);
    const desiredType = mapTraktRatingToInteraction(item.rating);
    const existing = await getInteractionsForTitle(args.userId, cachedTitle.id, [
      InteractionType.LIKE,
      InteractionType.DISLIKE,
      InteractionType.HIDE,
    ]);
    const likeInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.LIKE,
    );
    const dislikeInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.DISLIKE,
    );
    const hideInteraction = existing.find(
      (interaction) => interaction.interactionType === InteractionType.HIDE,
    );

    if (desiredType === null) {
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.LIKE,
      });
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.DISLIKE,
      });
      continue;
    }

    if (hideInteraction && hideInteraction.sourceContext !== SourceContext.IMPORTED) {
      continue;
    }

    if (desiredType === InteractionType.LIKE) {
      if (dislikeInteraction && dislikeInteraction.sourceContext !== SourceContext.IMPORTED) {
        continue;
      }

      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.DISLIKE,
      });

      if (!likeInteraction || likeInteraction.sourceContext === SourceContext.IMPORTED) {
        const result = await ensureImportedInteraction({
          userId: args.userId,
          titleCacheId: cachedTitle.id,
          interactionType: InteractionType.LIKE,
        });

        if (result.changed) {
          importedLikes += 1;
          recentImports.push(buildRecentImportItem(item, "LIKE"));
        }
      }
      continue;
    }

    if (likeInteraction && likeInteraction.sourceContext !== SourceContext.IMPORTED) {
      continue;
    }

    cleared += await clearImportedInteraction({
      userId: args.userId,
      titleCacheId: cachedTitle.id,
      interactionType: InteractionType.LIKE,
    });

    if (!dislikeInteraction || dislikeInteraction.sourceContext === SourceContext.IMPORTED) {
      const result = await ensureImportedInteraction({
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.DISLIKE,
      });

      if (result.changed) {
        importedDislikes += 1;
        recentImports.push(buildRecentImportItem(item, "DISLIKE"));
      }
    }
  }

  for (const interaction of currentImported) {
    if (!incomingIds.has(interaction.title.id)) {
      cleared += await clearImportedInteraction({
        userId: args.userId,
        titleCacheId: interaction.title.id,
        interactionType: interaction.interactionType,
      });
    }
  }

  return {
    importedLikes,
    importedDislikes,
    cleared,
    skippedWithoutTmdb,
    recentImports,
  };
}

async function updateConnectionAfterSuccessfulRefresh(args: {
  connectionId: string;
  token: TraktTokenResponse;
}) {
  await prisma.userTraktConnection.update({
    where: { id: args.connectionId },
    data: {
      accessTokenEncrypted: encryptSecret(args.token.access_token),
      refreshTokenEncrypted: encryptSecret(args.token.refresh_token),
      expiresAt: getTokenExpiresAt(args.token),
      scope: args.token.scope ?? null,
      lastSyncStatus: null,
      lastSyncError: null,
    },
  });
}

async function getAuthorizedTraktConnection(args: {
  userId: string;
  householdId: string;
  attemptedAt?: Date;
}) {
  const connection = await prisma.userTraktConnection.findFirst({
    where: {
      userId: args.userId,
      householdId: args.householdId,
    },
  });

  if (!connection) {
    throw new Error("Connect Trakt before running a sync.");
  }

  if (args.attemptedAt) {
    await prisma.userTraktConnection.update({
      where: {
        userId: args.userId,
      },
      data: {
        householdId: args.householdId,
        lastSyncAttemptedAt: args.attemptedAt,
      },
    });
  }

  let accessToken = decryptSecret(connection.accessTokenEncrypted);
  const refreshToken = decryptSecret(connection.refreshTokenEncrypted);

  if (connection.expiresAt.getTime() <= Date.now() + 60_000) {
    try {
      const refreshedToken = await refreshTraktToken(refreshToken);
      await updateConnectionAfterSuccessfulRefresh({
        connectionId: connection.id,
        token: refreshedToken,
      });
      accessToken = refreshedToken.access_token;
    } catch (error) {
      await prisma.userTraktConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAttemptedAt: args.attemptedAt ?? new Date(),
          lastSyncStatus: TraktSyncStatus.NEEDS_REAUTH,
          lastSyncError:
            error instanceof Error
              ? error.message
              : "Trakt authorization expired. Please reconnect.",
        },
      });

      throw error;
    }
  }

  return {
    connection,
    accessToken,
  };
}

export async function getTraktConnectionSummary(args: {
  userId: string;
  householdId: string;
}): Promise<TraktConnectionSummary> {
  const connection = await prisma.userTraktConnection.findFirst({
    where: {
      userId: args.userId,
      householdId: args.householdId,
    },
  });
  if (!connection) {
    return {
      isAvailable: traktConfigured(),
      isConnected: false,
      isMockMode: env.traktUseMockData,
      traktUsername: null,
      syncMode: "OFF",
      lastSyncTrigger: null,
      lastSyncAttemptedAt: null,
      lastSyncedAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      freshnessState: "NEVER_SYNCED",
      freshnessMessage: "Connect Trakt to keep your imported personal history fresh.",
      importedScopes: ["watched history", "ratings", "watchlist"],
      disconnectKeepsImportedData: true,
      lastSyncReview: null,
    };
  }
  const syncMode: TraktSyncModeKey = connection.syncMode;
  const lastSyncSummary = parseStoredSyncSummary(connection.lastSyncSummaryJson);
  const freshness = getTraktFreshnessState({
    syncMode,
    lastSyncedAt: connection.lastSyncedAt,
    lastSyncStatus: connection.lastSyncStatus ?? null,
  });

  return {
    isAvailable: traktConfigured(),
    isConnected: true,
    isMockMode: env.traktUseMockData,
    traktUsername: connection.traktUsername ?? null,
    syncMode,
    lastSyncTrigger: connection.lastSyncTrigger ?? null,
    lastSyncAttemptedAt: safeIso(connection.lastSyncAttemptedAt),
    lastSyncedAt: safeIso(connection.lastSyncedAt),
    lastSyncStatus: connection.lastSyncStatus ?? null,
    lastSyncError: connection.lastSyncError ?? null,
    freshnessState: freshness.state,
    freshnessMessage: freshness.message,
    importedScopes: ["watched history", "ratings", "watchlist"],
    disconnectKeepsImportedData: true,
    lastSyncReview: buildTraktSyncReview({
      lastSyncStatus: connection.lastSyncStatus ?? null,
      lastSyncError: connection.lastSyncError ?? null,
      lastSyncTrigger: connection.lastSyncTrigger ?? null,
      lastSyncSummary,
    }),
  };
}

export async function linkTraktAccount(args: {
  userId: string;
  householdId: string;
  email: string;
  code: string;
}) {
  if (!traktConfigured()) {
    throw new Error("Trakt OAuth is not configured for this environment.");
  }

  const token = await exchangeTraktCode(args.code);
  const profile = await getTraktProfile({
    email: args.email,
    accessToken: token.access_token,
  });

  await prisma.userTraktConnection.upsert({
    where: {
      userId: args.userId,
    },
    update: {
      householdId: args.householdId,
      traktUserId: profile.userId || null,
      traktUsername: profile.username || null,
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      expiresAt: getTokenExpiresAt(token),
      scope: token.scope ?? null,
      lastSyncTrigger: null,
      lastSyncSummaryJson: Prisma.DbNull,
      lastSyncAttemptedAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
    },
    create: {
      userId: args.userId,
      householdId: args.householdId,
      traktUserId: profile.userId || null,
      traktUsername: profile.username || null,
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      expiresAt: getTokenExpiresAt(token),
      scope: token.scope ?? null,
      syncMode: TraktSyncMode.DAILY,
      lastSyncTrigger: null,
      lastSyncSummaryJson: Prisma.DbNull,
    },
  });
}

export async function disconnectTraktAccount(args: {
  userId: string;
  householdId: string;
}) {
  const connection = await prisma.userTraktConnection.findFirst({
    where: {
      userId: args.userId,
      householdId: args.householdId,
    },
  });

  if (!connection) {
    return;
  }

  await revokeTraktToken(decryptSecret(connection.accessTokenEncrypted));

  await prisma.userTraktConnection.delete({
    where: {
      userId: args.userId,
    },
  });
}

export async function updateTraktSyncMode(args: {
  userId: string;
  householdId: string;
  syncMode: TraktSyncModeKey;
}) {
  const connection = await prisma.userTraktConnection.findFirst({
    where: {
      userId: args.userId,
      householdId: args.householdId,
    },
    select: {
      id: true,
    },
  });

  if (!connection) {
    throw new Error("Connect Trakt before changing sync freshness.");
  }

  await prisma.userTraktConnection.update({
    where: {
      userId: args.userId,
    },
    data: {
      householdId: args.householdId,
      syncMode: args.syncMode,
    },
  });
}

export async function syncTraktAccount(args: {
  userId: string;
  householdId: string;
  email: string;
  trigger?: "manual" | "auto" | "internal";
}) : Promise<TraktSyncResult> {
  const attemptedAt = new Date();
  const syncTrigger = normalizeTraktSyncTrigger(args.trigger ?? "manual");
  const { connection, accessToken } = await getAuthorizedTraktConnection({
    userId: args.userId,
    householdId: args.householdId,
    attemptedAt,
  });

  try {
    const currentActivities = await getTraktLastActivities({
      email: args.email,
      accessToken,
    });
    const previousActivities = parseStoredActivities(connection.lastActivitiesJson);
    const syncPlan = determineTraktSyncPlan({
      currentActivities,
      previousActivities,
    });

    let watchedImported = 0;
    let watchlistImported = 0;
    let likesImported = 0;
    let dislikesImported = 0;
    let watchedCleared = 0;
    let watchlistCleared = 0;
    let ratingsCleared = 0;
    let skippedWithoutTmdb = 0;
    const recentImports: TraktRecentImportItem[] = [];

    if (syncPlan.watchedMovies) {
      const result = await syncImportedWatchedCategory({
        userId: args.userId,
        mediaType: "movie",
        items: await fetchTraktWatched({
          email: args.email,
          accessToken,
          mediaType: "movie",
        }),
      });

      watchedImported += result.imported;
      watchedCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
      recentImports.push(...result.recentImports);
    }

    if (syncPlan.watchedShows) {
      const result = await syncImportedWatchedCategory({
        userId: args.userId,
        mediaType: "tv",
        items: await fetchTraktWatched({
          email: args.email,
          accessToken,
          mediaType: "tv",
        }),
      });

      watchedImported += result.imported;
      watchedCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
      recentImports.push(...result.recentImports);
    }

    if (syncPlan.watchlistMovies) {
      const result = await syncImportedWatchlistCategory({
        userId: args.userId,
        mediaType: "movie",
        items: await fetchTraktWatchlist({
          email: args.email,
          accessToken,
          mediaType: "movie",
        }),
      });

      watchlistImported += result.imported;
      watchlistCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
      recentImports.push(...result.recentImports);
    }

    if (syncPlan.watchlistShows) {
      const result = await syncImportedWatchlistCategory({
        userId: args.userId,
        mediaType: "tv",
        items: await fetchTraktWatchlist({
          email: args.email,
          accessToken,
          mediaType: "tv",
        }),
      });

      watchlistImported += result.imported;
      watchlistCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
      recentImports.push(...result.recentImports);
    }

    if (syncPlan.ratingsMovies) {
      const result = await syncImportedRatingsCategory({
        userId: args.userId,
        mediaType: "movie",
        items: await fetchTraktRatings({
          email: args.email,
          accessToken,
          mediaType: "movie",
        }),
      });

      likesImported += result.importedLikes;
      dislikesImported += result.importedDislikes;
      ratingsCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
      recentImports.push(...result.recentImports);
    }

    if (syncPlan.ratingsShows) {
      const result = await syncImportedRatingsCategory({
        userId: args.userId,
        mediaType: "tv",
        items: await fetchTraktRatings({
          email: args.email,
          accessToken,
          mediaType: "tv",
        }),
      });

      likesImported += result.importedLikes;
      dislikesImported += result.importedDislikes;
      ratingsCleared += result.cleared;
      skippedWithoutTmdb += result.skippedWithoutTmdb;
      recentImports.push(...result.recentImports);
    }

    const syncedAt = new Date();
    const syncSummary: TraktLastSyncSummary = {
      trigger: syncTrigger,
      changed:
        watchedImported > 0 ||
        watchlistImported > 0 ||
        likesImported > 0 ||
        dislikesImported > 0 ||
        watchedCleared > 0 ||
        watchlistCleared > 0 ||
        ratingsCleared > 0,
      imported: {
        watched: watchedImported,
        watchlist: watchlistImported,
        likes: likesImported,
        dislikes: dislikesImported,
      },
      cleared: {
        watched: watchedCleared,
        watchlist: watchlistCleared,
        ratings: ratingsCleared,
      },
      skippedWithoutTmdb,
      recentImports: [...recentImports]
        .sort(compareRecentImportItems)
        .slice(0, 5),
    };

    await prisma.userTraktConnection.update({
      where: {
        userId: args.userId,
      },
      data: {
        householdId: args.householdId,
        lastActivitiesJson: currentActivities as unknown as Prisma.InputJsonValue,
        lastSyncTrigger: syncTrigger as TraktSyncTrigger,
        lastSyncSummaryJson: syncSummary as unknown as Prisma.InputJsonValue,
        lastSyncAttemptedAt: attemptedAt,
        lastSyncedAt: syncedAt,
        lastSyncStatus: TraktSyncStatus.SUCCESS,
        lastSyncError: null,
      },
    });

    return {
      syncedAt: syncedAt.toISOString(),
      trigger: syncTrigger,
      changed: syncSummary.changed,
      imported: {
        watched: watchedImported,
        watchlist: watchlistImported,
        likes: likesImported,
        dislikes: dislikesImported,
      },
      cleared: {
        watched: watchedCleared,
        watchlist: watchlistCleared,
        ratings: ratingsCleared,
      },
      skippedWithoutTmdb,
      recentImports: syncSummary.recentImports,
    };
  } catch (error) {
    await prisma.userTraktConnection.update({
      where: {
        userId: args.userId,
      },
      data: {
        lastSyncTrigger: syncTrigger as TraktSyncTrigger,
        lastSyncAttemptedAt: attemptedAt,
        lastSyncStatus:
          error instanceof Error &&
          error.message.toLowerCase().includes("reconnect")
            ? TraktSyncStatus.NEEDS_REAUTH
            : TraktSyncStatus.ERROR,
        lastSyncError:
          error instanceof Error ? error.message : "Unable to sync Trakt right now.",
      },
    });

    throw error;
  }
}

export async function maybeRunAutoTraktSync(args: {
  userId: string;
  householdId: string;
  email: string;
}): Promise<TraktAutoSyncResult> {
  const connection = await prisma.userTraktConnection.findFirst({
    where: {
      userId: args.userId,
      householdId: args.householdId,
    },
    select: {
      syncMode: true,
      lastSyncedAt: true,
      lastSyncAttemptedAt: true,
      lastSyncStatus: true,
    },
  });

  if (!connection) {
    return {
      outcome: "skipped",
      reason: "not_connected",
    };
  }

  const decision = shouldAutoSyncTraktConnection({
    syncMode: connection.syncMode,
    lastSyncedAt: connection.lastSyncedAt,
    lastSyncAttemptedAt: connection.lastSyncAttemptedAt,
    lastSyncStatus: connection.lastSyncStatus,
  });

  if (!decision.shouldSync) {
    return {
      outcome: "skipped",
      reason: decision.reason,
    };
  }

  try {
    const result = await syncTraktAccount({
      userId: args.userId,
      householdId: args.householdId,
      email: args.email,
      trigger: "auto",
    });

    return {
      outcome: "synced",
      reason: decision.reason,
      result,
    };
  } catch (error) {
    return {
      outcome: "failed",
      reason: "error",
      error:
        error instanceof Error ? error.message : "Unable to sync Trakt right now.",
    };
  }
}

export async function runInternalTraktSync(args: {
  userId: string;
  force?: boolean;
}): Promise<TraktAutoSyncResult> {
  const user = await prisma.user.findUnique({
    where: {
      id: args.userId,
    },
    select: {
      id: true,
      email: true,
      householdId: true,
    },
  });

  if (!user) {
    return {
      outcome: "skipped",
      reason: "not_connected",
      error: "User not found.",
    };
  }

  if (args.force) {
    try {
      const result = await syncTraktAccount({
        userId: user.id,
        householdId: user.householdId,
        email: user.email,
        trigger: "internal",
      });

      return {
        outcome: "synced",
        reason: "stale",
        result,
      };
    } catch (error) {
      return {
        outcome: "failed",
        reason: "error",
        error:
          error instanceof Error ? error.message : "Unable to sync Trakt right now.",
      };
    }
  }

  return maybeRunAutoTraktSync({
    userId: user.id,
    householdId: user.householdId,
    email: user.email,
  });
}
