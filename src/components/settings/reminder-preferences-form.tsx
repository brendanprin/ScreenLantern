"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { emitReminderChangeEvent } from "@/components/reminders/reminder-nav-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ReminderAggressivenessKey,
  ReminderPreferences,
} from "@/lib/types";

interface ReminderPreferencesFormProps {
  initialPreferences: ReminderPreferences;
  cooldownDays: number;
}

const AGGRESSIVENESS_OPTIONS: Array<{
  value: ReminderAggressivenessKey;
  label: string;
  description: string;
}> = [
  {
    value: "LIGHT",
    label: "Light",
    description: "Keep reminders focused on the highest-value nudges.",
  },
  {
    value: "BALANCED",
    label: "Balanced",
    description: "Show practical reminders plus a few softer resurfacing picks.",
  },
  {
    value: "PROACTIVE",
    label: "Proactive",
    description: "Bring back more saved titles that still look promising.",
  },
];

export function ReminderPreferencesForm({
  initialPreferences,
  cooldownDays,
}: ReminderPreferencesFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<ReminderPreferences>(initialPreferences);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof ReminderPreferences>(
    key: K,
    value: ReminderPreferences[K],
  ) {
    setSaved(false);
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function save() {
    startTransition(async () => {
      setError(null);
      setSaved(false);

      try {
        const response = await fetch("/api/settings/reminders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to save reminder preferences.");
        }

        setSaved(true);
        router.refresh();
        emitReminderChangeEvent();
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Unable to save reminder preferences.",
        );
      }
    });
  }

  return (
    <Card className="bg-white/80">
      <CardHeader>
        <CardTitle>Reminder preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Tune how often ScreenLantern nudges you so the inbox stays useful without getting noisy.
        </p>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/70">
            Reminder types
          </p>
          <PreferenceToggle
            label="Available now reminders"
            description="Highlight saved titles that match your selected services right now."
            checked={values.enableAvailableNow}
            onChange={(next) => update("enableAvailableNow", next)}
          />
          <PreferenceToggle
            label="Watchlist resurfacing reminders"
            description="Bring back solo saved titles that still fit your taste even if they are softer picks."
            checked={values.enableWatchlistResurface}
            onChange={(next) => update("enableWatchlistResurface", next)}
          />
          <PreferenceToggle
            label="Group watch candidate reminders"
            description="Surface shared-fit saved titles for active group contexts."
            checked={values.enableGroupWatchCandidate}
            onChange={(next) => update("enableGroupWatchCandidate", next)}
          />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/70">
            Reminder contexts
          </p>
          <PreferenceToggle
            label="Solo reminders"
            description="Let ScreenLantern generate reminders when you are browsing as one profile."
            checked={values.enableSoloReminders}
            onChange={(next) => update("enableSoloReminders", next)}
          />
          <PreferenceToggle
            label="Group reminders"
            description="Let ScreenLantern generate reminders when you switch into a saved group or ad hoc room."
            checked={values.enableGroupReminders}
            onChange={(next) => update("enableGroupReminders", next)}
          />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/70">
            Reminder pace
          </p>
          <div className="space-y-2 rounded-2xl border border-border bg-background/70 p-4">
            <Select
              onValueChange={(value) =>
                update("aggressiveness", value as ReminderAggressivenessKey)
              }
              value={values.aggressiveness}
            >
              <SelectTrigger aria-label="Reminder pace">
                <SelectValue placeholder="Choose reminder pace" />
              </SelectTrigger>
              <SelectContent>
                {AGGRESSIVENESS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {
                AGGRESSIVENESS_OPTIONS.find(
                  (option) => option.value === values.aggressiveness,
                )?.description
              }
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/70">
            Dismissed reminders
          </p>
          <PreferenceToggle
            label="Dismissed reminders can return after a cooldown"
            description={`If turned on, ScreenLantern can re-surface a dismissed reminder after ${cooldownDays} days if it still fits your current context.`}
            checked={values.allowDismissedReappear}
            onChange={(next) => update("allowDismissedReappear", next)}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved ? (
          <p className="text-sm text-primary">Reminder preferences saved.</p>
        ) : null}
        <Button disabled={isPending} onClick={save}>
          {isPending ? "Saving..." : "Save reminder preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PreferenceToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border bg-background/70 px-4 py-3">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span className="space-y-1">
        <span className="block font-medium text-foreground">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
