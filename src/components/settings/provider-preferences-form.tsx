"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface ProviderPreferencesFormProps {
  providerOptions: string[];
  selectedProviders: string[];
}

export function ProviderPreferencesForm({
  providerOptions,
  selectedProviders,
}: ProviderPreferencesFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<string[]>(selectedProviders);
  const [query, setQuery] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  function toggle(provider: string) {
    setValues((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider],
    );
  }

  function save() {
    setSaveError(null);
    setSaveSuccess(false);
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providers: values }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError((data as { error?: string }).error ?? "Unable to save provider preferences.");
          return;
        }

        setSaveSuccess(true);
        router.refresh();
      } catch {
        setSaveError("Unable to save provider preferences. Check your connection and try again.");
      }
    });
  }

  const normalizedQuery = query.trim().toLowerCase();
  const selected = values.filter((v) => providerOptions.includes(v));
  const filtered = normalizedQuery
    ? providerOptions.filter((p) => p.toLowerCase().includes(normalizedQuery))
    : providerOptions.filter((p) => !values.includes(p));

  function ProviderRow({ provider }: { provider: string }) {
    return (
      <label
        key={provider}
        className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 px-4 py-3 cursor-pointer"
      >
        <Checkbox
          checked={values.includes(provider)}
          onCheckedChange={() => toggle(provider)}
        />
        <span className="text-sm">{provider}</span>
      </label>
    );
  }

  return (
    <Card className="bg-white/80">
      <CardHeader>
        <CardTitle>Streaming provider preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These providers lightly boost search and recommendation ranking when availability data is present.
        </p>

        {selected.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Selected ({selected.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {selected.map((provider) => (
                <ProviderRow key={provider} provider={provider} />
              ))}
            </div>
          </div>
        )}

        <Input
          placeholder="Search providers..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-background/70"
        />

        {filtered.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 max-h-96 overflow-y-auto pr-1">
            {filtered.map((provider) => (
              <ProviderRow key={provider} provider={provider} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No providers match &ldquo;{query}&rdquo;
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button disabled={isPending} onClick={save}>
            {isPending ? "Saving..." : "Save preferences"}
          </Button>
          {saveSuccess && !isPending && (
            <span className="text-sm text-green-600">Saved</span>
          )}
          {saveError && (
            <span className="text-sm text-destructive">{saveError}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
