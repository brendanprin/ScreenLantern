import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NetflixSyncForm } from "@/components/settings/netflix-sync-form";
import { NetflixUnresolvedList } from "@/components/settings/netflix-unresolved-list";
import { ProviderPreferencesForm } from "@/components/settings/provider-preferences-form";
import { ReminderPreferencesForm } from "@/components/settings/reminder-preferences-form";
import { TraktIntegrationForm } from "@/components/settings/trakt-integration-form";
import { getCurrentUserContext } from "@/lib/auth";
import { env } from "@/lib/env";
import { getProviderOptions } from "@/lib/services/catalog";
import {
  DISMISSED_REMINDER_REAPPEAR_COOLDOWN_DAYS,
  getReminderPreferences,
} from "@/lib/services/reminders";
import { getTraktConnectionSummary } from "@/lib/services/trakt";
import { prisma } from "@/lib/prisma";
import { ImportSource, UnresolvedImportStatus } from "@prisma/client";

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getNetflixSyncStatus() {
  if (!env.streamingSyncUrl) {
    return { sidecarReachable: false, configured: false, intervalHours: 0, state: null };
  }

  try {
    const response = await fetch(`${env.streamingSyncUrl}/status`, { cache: "no-store" });
    const payload = (await response.json()) as {
      configured: boolean;
      intervalHours: number;
      state: unknown;
    };
    return {
      sidecarReachable: true,
      configured: payload.configured,
      intervalHours: payload.intervalHours,
      state: payload.state as Parameters<typeof NetflixSyncForm>[0]["initialStatus"]["state"],
    };
  } catch {
    return { sidecarReachable: false, configured: false, intervalHours: 0, state: null };
  }
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getCurrentUserContext();
  const params = await searchParams;
  const providerOptions = await getProviderOptions("all");
  const reminderPreferences = await getReminderPreferences({
    userId: user.userId,
    householdId: user.householdId,
  });
  const traktSummary = await getTraktConnectionSummary({
    userId: user.userId,
    householdId: user.householdId,
  });
  const netflixSyncStatus = await getNetflixSyncStatus();
  const unresolvedImports = await prisma.unresolvedImport.findMany({
    where: {
      userId: user.userId,
      source: ImportSource.NETFLIX,
      status: UnresolvedImportStatus.PENDING,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, rawTitle: true, createdAt: true },
  });

  // For each unresolved title, check if it already exists in the user's library
  // (e.g. imported via Trakt) so we can surface it as a pre-filled suggestion.
  const watchedTitles =
    unresolvedImports.length > 0
      ? await prisma.userTitleInteraction.findMany({
          where: { userId: user.userId, interactionType: "WATCHED" },
          select: {
            title: {
              select: {
                id: true,
                tmdbId: true,
                mediaType: true,
                title: true,
                releaseDate: true,
                posterPath: true,
              },
            },
          },
        })
      : [];

  function normalizeForMatch(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function findLibrarySuggestions(rawTitle: string) {
    const needle = normalizeForMatch(rawTitle);
    const scored: Array<{ score: number; tmdbId: number; mediaType: "movie" | "tv"; title: string; releaseYear: number | null; posterPath: string | null }> = [];

    for (const { title } of watchedTitles) {
      const hay = normalizeForMatch(title.title);
      let score = 0;
      if (hay === needle) score = 3;
      else if (hay.startsWith(needle) || needle.startsWith(hay)) score = 2;
      else if (hay.includes(needle) || needle.includes(hay)) score = 1;
      if (score === 0) continue;
      scored.push({
        score,
        tmdbId: title.tmdbId,
        mediaType: title.mediaType.toLowerCase() as "movie" | "tv",
        title: title.title,
        releaseYear: title.releaseDate ? new Date(title.releaseDate).getFullYear() : null,
        posterPath: title.posterPath ?? null,
      });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ score: _score, ...rest }) => rest);
  }

  const unresolvedWithSuggestions = unresolvedImports.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    librarySuggestions: findLibrarySuggestions(item.rawTitle),
  }));
  const selectedProviders = [...new Set([...user.preferredProviders, ...providerOptions])].sort(
    (left, right) => left.localeCompare(right),
  );
  const traktNoticeType = readSingleParam(params.traktStatus);
  const traktNoticeMessage = readSingleParam(params.traktMessage);
  const traktNotice =
    traktNoticeType === "success" || traktNoticeType === "error"
      ? {
          type: traktNoticeType as "success" | "error",
          message: traktNoticeMessage ?? "",
        }
      : null;

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Settings</p>
          <CardTitle>Recommendation preferences</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          ScreenLantern uses these preferences as soft signals, not hard locks, so you still see good options when provider data is incomplete.
        </CardContent>
      </Card>

      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle>Catalog mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
          {env.tmdbUseMockData ? (
            <>
              <p>
                {env.tmdbApiKey
                  ? "TMDb mock mode is enabled right now."
                  : "TMDb live mode is unavailable because TMDB_API_KEY is missing, so ScreenLantern is using the local mock catalog."}
              </p>
              <p>
                Add a TMDb API key and set <code>TMDB_USE_MOCK_DATA=0</code> before a
                production-style release check.
              </p>
            </>
          ) : (
            <p>
              Live TMDb mode is active for watch-region <code>{env.tmdbWatchRegion}</code>.
            </p>
          )}
        </CardContent>
      </Card>

      <ProviderPreferencesForm
        providerOptions={selectedProviders}
        selectedProviders={user.preferredProviders}
      />
      <TraktIntegrationForm summary={traktSummary} notice={traktNotice} />
      <NetflixSyncForm initialStatus={netflixSyncStatus} />
      <NetflixUnresolvedList initialItems={unresolvedWithSuggestions} />
      <ReminderPreferencesForm
        initialPreferences={reminderPreferences}
        cooldownDays={DISMISSED_REMINDER_REAPPEAR_COOLDOWN_DAYS}
      />
    </div>
  );
}
