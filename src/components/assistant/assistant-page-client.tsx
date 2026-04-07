"use client";

import { useMemo, useState, useTransition } from "react";
import { MessageSquare, RotateCcw, Sparkles } from "lucide-react";

import { useActiveContext } from "@/components/active-context-provider";
import { TitleCard } from "@/components/title-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AssistantConversationSnapshot,
  AssistantMessageCard,
} from "@/lib/types";

interface AssistantPageClientProps {
  initialSnapshot: AssistantConversationSnapshot;
}

function isConversationSnapshot(
  value: AssistantConversationSnapshot | { error?: string },
): value is AssistantConversationSnapshot {
  return "messages" in value;
}

const STARTER_PROMPTS = [
  "What should I watch tonight?",
  "Give me something funny under 2 hours.",
  "What should we watch tonight on our services?",
  "What is a good pick from our watchlist?",
] as const;

function renderMessageText(text: string) {
  return text.split("\n").map((line, index) => (
    <p key={`${line}-${index}`} className="whitespace-pre-wrap">
      {line}
    </p>
  ));
}

function buildCurrentAskLabels(
  snapshot: AssistantConversationSnapshot,
  contextLabel: string,
) {
  if (!snapshot.threadState) {
    return [];
  }

  const labels = [`For ${contextLabel}`];

  const scopeLabel =
    snapshot.threadState.sourceScope === "watchlist"
      ? "Watchlist"
      : snapshot.threadState.sourceScope === "library"
        ? "Library"
        : snapshot.threadState.sourceScope === "shared_current"
          ? "Shared watchlist"
          : snapshot.threadState.sourceScope === "shared_household"
            ? "Household saves"
            : "Recommendations";

  labels.push(scopeLabel);

  if (snapshot.threadState.constraints.mediaType === "movie") {
    labels.push("Movies");
  } else if (snapshot.threadState.constraints.mediaType === "tv") {
    labels.push("Shows");
  }

  if (snapshot.threadState.constraints.mood) {
    labels.push(
      snapshot.threadState.constraints.mood === "funny"
        ? "Funny"
        : snapshot.threadState.constraints.mood === "lighter"
          ? "Lighter"
          : snapshot.threadState.constraints.mood === "tense"
            ? "Tense"
            : snapshot.threadState.constraints.mood === "romantic"
              ? "Romantic"
              : snapshot.threadState.constraints.mood === "scary"
                ? "Scary"
                : "Thoughtful",
    );
  }

  if (typeof snapshot.threadState.constraints.runtimeMax === "number") {
    labels.push(
      snapshot.threadState.constraints.runtimeMax === 120
        ? "Under 2h"
        : snapshot.threadState.constraints.runtimeMax === 90
          ? "Under 90m"
          : `Under ${snapshot.threadState.constraints.runtimeMax}m`,
    );
  }

  if (snapshot.threadState.constraints.onlyOnPreferredProviders) {
    labels.push("Our services");
  }

  if (snapshot.threadState.constraints.excludeWatched) {
    labels.push("Unwatched only");
  }

  if (snapshot.threadState.constraints.practicalTonight) {
    labels.push("Tonight");
  }

  if (snapshot.threadState.constraints.provider) {
    labels.push(snapshot.threadState.constraints.provider);
  }

  if (snapshot.threadState.referenceTitle) {
    labels.push(`Like ${snapshot.threadState.referenceTitle.title}`);
  }

  return labels;
}

export function AssistantPageClient({ initialSnapshot }: AssistantPageClientProps) {
  const { activeNames, isGroupMode } = useActiveContext();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const contextLabel = useMemo(() => {
    if (isGroupMode) {
      return activeNames.join(" + ") || snapshot.context.label;
    }

    return activeNames[0] ?? snapshot.context.label;
  }, [activeNames, isGroupMode, snapshot.context.label]);
  const currentAskLabels = useMemo(
    () => buildCurrentAskLabels(snapshot, contextLabel),
    [contextLabel, snapshot],
  );

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: trimmed }),
        });

        const payload = (await response.json()) as
          | AssistantConversationSnapshot
          | { error?: string };

        if (!response.ok || !isConversationSnapshot(payload)) {
          throw new Error(
            "error" in payload ? payload.error ?? "Unable to get an assistant answer." : "Unable to get an assistant answer.",
          );
        }

        setSnapshot(payload);
        setDraft("");
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Unable to get an assistant answer.",
        );
      }
    });
  }

  async function clearConversation() {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/assistant", {
          method: "DELETE",
        });
        const payload = (await response.json()) as
          | AssistantConversationSnapshot
          | { error?: string };

        if (!response.ok || !isConversationSnapshot(payload)) {
          throw new Error(
            "error" in payload ? payload.error ?? "Unable to reset the assistant." : "Unable to reset the assistant.",
          );
        }

        setSnapshot(payload);
      } catch (clearError) {
        setError(
          clearError instanceof Error
            ? clearError.message
            : "Unable to reset the assistant.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-white via-white to-accent/60">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
            Recommendation assistant
          </p>
          <CardTitle className="max-w-3xl text-4xl">
            Ask ScreenLantern for grounded picks instead of starting from a blank slate.
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-3">
            <div className="rounded-[24px] border border-border bg-background/60 p-4">
              <p
                className="text-sm font-medium text-foreground"
                data-testid="assistant-context-label"
              >
                For {contextLabel}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                ScreenLantern keeps the assistant grounded in your current solo or
                group context, saved titles, provider access, and personal imported
                Trakt state.
              </p>
              {snapshot.messages.length > 0 && currentAskLabels.length > 0 ? (
                <div className="mt-4 space-y-2" data-testid="assistant-current-ask">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Current ask
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentAskLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border/80 bg-white/80 px-3 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {snapshot.isMockMode ? (
              <p className="text-sm text-muted-foreground">
                {snapshot.providerLabel} mode is active. The assistant still uses
                ScreenLantern data, but the answer layer is deterministic for local
                testing.
              </p>
            ) : snapshot.runtimeMode === "ollama" ? (
              <p className="text-sm text-muted-foreground">
                {snapshot.providerLabel} mode is active. Answers stay grounded in
                ScreenLantern data and run through your local model server.
              </p>
            ) : null}
          </div>
          <Button variant="outline" onClick={clearConversation} disabled={isPending}>
            <RotateCcw className="h-4 w-4" />
            Start fresh
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white/80">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Assistant thread</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Keep it focused: what fits tonight, what is already saved, what is on
              your services, or why a title is a good match.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            One active thread
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {snapshot.messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-border/80 bg-background/40 p-5 text-sm text-muted-foreground">
                Start with a direct ask like “What should Brendan + Palmer watch
                tonight?” or “Give me something funny under 2 hours on our services.”
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    disabled={isPending}
                  >
                    <Sparkles className="h-4 w-4" />
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6" data-testid="assistant-thread">
              {snapshot.messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-3xl rounded-[28px] bg-primary px-5 py-4 text-primary-foreground"
                      : "max-w-4xl rounded-[28px] border border-border/80 bg-background/70 px-5 py-4"
                  }
                  data-testid={`assistant-message-${message.role}`}
                >
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] opacity-70">
                    {message.role === "user" ? "You" : "ScreenLantern"}
                  </p>
                  <div className="space-y-2 text-sm leading-6">
                    {renderMessageText(message.text)}
                  </div>

                  {message.cards.length > 0 ? (
                    <div className="mt-5 grid gap-4">
                      {message.cards.map((card: AssistantMessageCard) => (
                        <div key={card.id} data-testid="assistant-card">
                          <TitleCard
                            title={card.title}
                            showActions={false}
                            recommendationExplanations={card.recommendationExplanations}
                            recommendationBadges={card.recommendationBadges}
                            recommendationContextLabel={card.recommendationContextLabel ?? undefined}
                            fitSummaryLabel={card.fitSummaryLabel ?? undefined}
                            personalSourceBadge={card.personalSourceBadge ?? undefined}
                            handoff={card.handoff}
                            testId={`assistant-card-${card.title.mediaType}-${card.title.tmdbId}`}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
            }}
          >
            <label className="text-sm font-medium text-foreground" htmlFor="assistant-draft">
              Ask for a recommendation
            </label>
            <textarea
              id="assistant-draft"
              className="min-h-28 w-full rounded-[24px] border border-input bg-background/80 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="What should Brendan + Palmer watch tonight on our services?"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isPending || draft.trim().length === 0}>
                {isPending ? "Thinking..." : "Ask ScreenLantern"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Try: “Something like Severance but lighter” or “What is best for me
                that I have not watched yet?”
              </p>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
