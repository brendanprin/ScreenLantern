import { ReminderCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildReminderContextKey,
  buildReminderDraft,
  mapReminderCategory,
} from "@/lib/services/reminders";
import type { WatchlistResurfacingCandidate } from "@/lib/services/recommendations";
import type { RecommendationExplanation, TitleSummary } from "@/lib/types";

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
  laneId?: "available_now" | "back_on_your_radar";
  explanations?: RecommendationExplanation[];
}): WatchlistResurfacingCandidate {
  return {
    laneId: args?.laneId ?? "available_now",
    titleCacheId: "title-cache-1",
    availabilityMatch: "selected_services",
    latestUpdatedAt: "2026-04-03T18:00:00.000Z",
    savedByNames: ["Brendan"],
    item: {
      title: baseTitle,
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
