import { ReminderCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_PREFERENCES,
  buildReminderContextKey,
  buildReminderDraft,
  dedupeReminderCandidates,
  getSoftReminderLimit,
  mapReminderCategory,
  selectReminderCandidatesForPreferences,
  shouldReactivateDismissedReminder,
} from "@/lib/services/reminders";
import type { WatchlistResurfacingCandidate } from "@/lib/services/recommendations";
import type {
  RecommendationExplanation,
  ReminderPreferences,
  TitleSummary,
} from "@/lib/types";

const baseTitle: TitleSummary = {
  tmdbId: 16,
  mediaType: "movie",
  title: "Mad Max: Fury Road",
  overview: "A relentless convoy races through the wasteland.",
  posterPath: null,
  backdropPath: null,
  releaseDate: "2015-05-15",
  runtimeMinutes: 120,
  genres: ["Action", "Adventure", "Science Fiction"],
  voteAverage: 8.1,
  popularity: 88,
  providers: [{ name: "Max" }],
  providerStatus: "available",
};

function buildCandidate(args?: {
  titleCacheId?: string;
  tmdbId?: number;
  laneId?: "available_now" | "back_on_your_radar";
  explanations?: RecommendationExplanation[];
}): WatchlistResurfacingCandidate {
  return {
    titleCacheId: args?.titleCacheId ?? "title-cache-1",
    laneId: args?.laneId ?? "available_now",
    availabilityMatch: "selected_services",
    latestUpdatedAt: "2026-04-03T18:00:00.000Z",
    savedByNames: ["Brendan"],
    savedContextLabel: null,
    source: "personal",
    item: {
      title: {
        ...baseTitle,
        tmdbId: args?.tmdbId ?? baseTitle.tmdbId,
      },
      score: 95,
      badges: ["Available now"],
      explanations: args?.explanations ?? [
        {
          category: "watchlist_resurface",
          summary: "Saved to your watchlist and available on your services",
          detail: "It is currently practical to start from the services tied to this profile.",
        },
      ],
    },
  };
}

describe("buildReminderContextKey", () => {
  it("normalizes selected ids so context keys stay stable", () => {
    expect(
      buildReminderContextKey({
        mode: "GROUP",
        selectedUserIds: ["palmer", "brendan", "palmer"],
      }),
    ).toBe("GROUP:brendan|palmer");
  });
});

describe("getSoftReminderLimit", () => {
  it("keeps softer reminder volume low in light mode", () => {
    expect(getSoftReminderLimit("LIGHT")).toBe(1);
  });

  it("allows more softer reminder volume in proactive mode", () => {
    expect(getSoftReminderLimit("PROACTIVE")).toBe(5);
  });
});

describe("dedupeReminderCandidates", () => {
  it("keeps the higher-value available-now candidate when duplicates slip through", () => {
    const deduped = dedupeReminderCandidates([
      buildCandidate({
        laneId: "back_on_your_radar",
        titleCacheId: "title-cache-1",
        tmdbId: 16,
      }),
      buildCandidate({
        laneId: "available_now",
        titleCacheId: "title-cache-1",
        tmdbId: 16,
      }),
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.laneId).toBe("available_now");
  });
});

describe("selectReminderCandidatesForPreferences", () => {
  function withPreferences(
    overrides?: Partial<ReminderPreferences>,
  ): ReminderPreferences {
    return {
      ...DEFAULT_REMINDER_PREFERENCES,
      ...overrides,
    };
  }

  it("suppresses disabled categories", () => {
    const selected = selectReminderCandidatesForPreferences({
      candidates: [
        buildCandidate({
          laneId: "available_now",
          titleCacheId: "available-title",
          tmdbId: 16,
        }),
        buildCandidate({
          laneId: "back_on_your_radar",
          titleCacheId: "soft-title",
          tmdbId: 17,
        }),
      ],
      preferences: withPreferences({
        enableAvailableNow: false,
      }),
      mode: "SOLO",
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]?.laneId).toBe("back_on_your_radar");
  });

  it("enforces the group reminder toggle", () => {
    const selected = selectReminderCandidatesForPreferences({
      candidates: [
        buildCandidate({
          laneId: "available_now",
          titleCacheId: "group-title",
          tmdbId: 18,
        }),
      ],
      preferences: withPreferences({
        enableGroupReminders: false,
      }),
      mode: "GROUP",
    });

    expect(selected).toHaveLength(0);
  });

  it("changes softer reminder volume based on aggressiveness", () => {
    const candidates = [
      buildCandidate({
        laneId: "available_now",
        titleCacheId: "available-title",
        tmdbId: 16,
      }),
      buildCandidate({
        laneId: "back_on_your_radar",
        titleCacheId: "soft-title-1",
        tmdbId: 17,
      }),
      buildCandidate({
        laneId: "back_on_your_radar",
        titleCacheId: "soft-title-2",
        tmdbId: 18,
      }),
      buildCandidate({
        laneId: "back_on_your_radar",
        titleCacheId: "soft-title-3",
        tmdbId: 19,
      }),
      buildCandidate({
        laneId: "back_on_your_radar",
        titleCacheId: "soft-title-4",
        tmdbId: 20,
      }),
    ];

    const light = selectReminderCandidatesForPreferences({
      candidates,
      preferences: withPreferences({
        aggressiveness: "LIGHT",
      }),
      mode: "SOLO",
    });
    const proactive = selectReminderCandidatesForPreferences({
      candidates,
      preferences: withPreferences({
        aggressiveness: "PROACTIVE",
      }),
      mode: "SOLO",
    });

    expect(light).toHaveLength(2);
    expect(proactive).toHaveLength(5);
  });
});

describe("shouldReactivateDismissedReminder", () => {
  it("does not reappear dismissed reminders when the preference is off", () => {
    expect(
      shouldReactivateDismissedReminder({
        dismissedAt: new Date("2026-03-01T00:00:00.000Z"),
        allowDismissedReappear: false,
        now: new Date("2026-04-03T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("waits for the cooldown window before allowing reappearance", () => {
    expect(
      shouldReactivateDismissedReminder({
        dismissedAt: new Date("2026-03-25T00:00:00.000Z"),
        allowDismissedReappear: true,
        now: new Date("2026-04-03T00:00:00.000Z"),
      }),
    ).toBe(false);

    expect(
      shouldReactivateDismissedReminder({
        dismissedAt: new Date("2026-03-10T00:00:00.000Z"),
        allowDismissedReappear: true,
        now: new Date("2026-04-03T00:00:00.000Z"),
      }),
    ).toBe(true);
  });
});

describe("mapReminderCategory", () => {
  it("maps available-now resurfacing into available reminders", () => {
    expect(
      mapReminderCategory({
        laneId: "available_now",
        isGroupMode: false,
      }),
    ).toBe(ReminderCategory.AVAILABLE_NOW);
  });

  it("maps group resurfacing into group-watch reminders", () => {
    expect(
      mapReminderCategory({
        laneId: "back_on_your_radar",
        isGroupMode: true,
      }),
    ).toBe(ReminderCategory.GROUP_WATCH_CANDIDATE);
  });

  it("maps solo resurfacing into watchlist reminders", () => {
    expect(
      mapReminderCategory({
        laneId: "back_on_your_radar",
        isGroupMode: false,
      }),
    ).toBe(ReminderCategory.WATCHLIST_RESURFACE);
  });
});

describe("buildReminderDraft", () => {
  it("preserves available-now explanation copy for solo reminders", () => {
    const draft = buildReminderDraft({
      candidate: buildCandidate(),
      contextLabel: "Brendan",
      mode: "SOLO",
      selectedUserIds: ["brendan"],
      savedGroupId: null,
      isGroupMode: false,
    });

    expect(draft.category).toBe(ReminderCategory.AVAILABLE_NOW);
    expect(draft.summary).toBe(
      "Saved to your watchlist and available on your services",
    );
    expect(draft.contextKey).toBe("SOLO:brendan");
  });

  it("uses group-watch-candidate category for group resurfacing", () => {
    const draft = buildReminderDraft({
      candidate: buildCandidate({
        laneId: "back_on_your_radar",
        explanations: [
          {
            category: "watchlist_resurface",
            summary: "Saved by Brendan for Brendan and Palmer",
            detail:
              "Brendan already saved this, so it is worth bringing back into the room conversation.",
          },
        ],
      }),
      contextLabel: "Brendan + Palmer",
      mode: "GROUP",
      selectedUserIds: ["palmer", "brendan"],
      savedGroupId: "group-1",
      isGroupMode: true,
    });

    expect(draft.category).toBe(ReminderCategory.GROUP_WATCH_CANDIDATE);
    expect(draft.summary).toBe("Saved by Brendan for Brendan and Palmer");
    expect(draft.contextKey).toBe("GROUP:brendan|palmer");
  });

  it("keeps sparse-signal resurfacing language for non-available reminders", () => {
    const draft = buildReminderDraft({
      candidate: buildCandidate({
        laneId: "back_on_your_radar",
        explanations: [
          {
            category: "watchlist_resurface",
            summary: "Back on your radar from your watchlist",
            detail:
              "You already saved it, and it still lines up with the shape of your current picks.",
          },
        ],
      }),
      contextLabel: "Katie",
      mode: "SOLO",
      selectedUserIds: ["katie"],
      savedGroupId: null,
      isGroupMode: false,
    });

    expect(draft.category).toBe(ReminderCategory.WATCHLIST_RESURFACE);
    expect(draft.summary).toBe("Back on your radar from your watchlist");
  });
});
