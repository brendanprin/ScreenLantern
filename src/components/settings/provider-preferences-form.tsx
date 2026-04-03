"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PROVIDER_OPTIONS } from "@/lib/constants";

interface ProviderPreferencesFormProps {
  selectedProviders: string[];
}

export function ProviderPreferencesForm({
  selectedProviders,
}: ProviderPreferencesFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<string[]>(selectedProviders);

  function toggle(provider: string) {
    setValues((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider],
    );
  }

  function save() {
    startTransition(async () => {
      await fetch("/api/settings/providers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ providers: values }),
      });

      router.refresh();
    });
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
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDER_OPTIONS.map((provider) => (
            <label
              key={provider}
              className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 px-4 py-3"
            >
              <Checkbox
                checked={values.includes(provider)}
                onCheckedChange={() => toggle(provider)}
              />
              <span>{provider}</span>
            </label>
          ))}
        </div>
        <Button disabled={isPending} onClick={save}>
          {isPending ? "Saving..." : "Save preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}

