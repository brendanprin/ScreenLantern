import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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
      <ReminderPreferencesForm
        initialPreferences={reminderPreferences}
        cooldownDays={DISMISSED_REMINDER_REAPPEAR_COOLDOWN_DAYS}
      />
    </div>
  );
}
