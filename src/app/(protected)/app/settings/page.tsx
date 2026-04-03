import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderPreferencesForm } from "@/components/settings/provider-preferences-form";
import { getCurrentUserContext } from "@/lib/auth";
import { getProviderOptions } from "@/lib/services/catalog";

export default async function SettingsPage() {
  const user = await getCurrentUserContext();
  const providerOptions = await getProviderOptions("all");
  const selectedProviders = [...new Set([...user.preferredProviders, ...providerOptions])].sort(
    (left, right) => left.localeCompare(right),
  );

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

      <ProviderPreferencesForm
        providerOptions={selectedProviders}
        selectedProviders={user.preferredProviders}
      />
    </div>
  );
}
