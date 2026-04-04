import { InteractionType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { deriveCompactFitLabel } from "@/lib/fit-labels";
import {
  buildMemberFitSignal,
  summarizeTitleFit,
} from "@/lib/services/title-fit";

describe("buildMemberFitSignal", () => {
  it("treats direct dislikes as a conflict signal", () => {
    const signal = buildMemberFitSignal({
      id: "katie",
      name: "Katie",
      isActiveContextMember: true,
      interactionTypes: [InteractionType.DISLIKE],
      watchedViaGroup: false,
      savedForGroup: false,
      savedForHousehold: false,
      score: -850,
      explanations: [
        {
          category: "watch_history",
          summary: "You disliked this before",
        },
      ],
    });

    expect(signal.tone).toBe("conflict");
    expect(signal.label).toBe("Potential conflict");
    expect(signal.chips).toContain("Disliked it");
  });

  it("uses personal saves as a positive but lighter-weight planning signal", () => {
    const signal = buildMemberFitSignal({
      id: "brendan",
      name: "Brendan",
      isActiveContextMember: true,
      interactionTypes: [InteractionType.WATCHLIST],
      watchedViaGroup: false,
      savedForGroup: false,
      savedForHousehold: false,
      score: 61,
      explanations: [],
    });

    expect(signal.tone).toBe("good");
    expect(signal.label).toBe("Saved it personally");
    expect(signal.chips).toContain("Saved personally");
  });
});

describe("summarizeTitleFit", () => {
  it("surfaces mixed-fit language for groups with one strong signal and one conflict", () => {
    const summary = summarizeTitleFit({
      isGroupMode: true,
      contextLabel: "Brendan + Katie",
      memberSignals: [
        {
          id: "brendan",
          name: "Brendan",
          isActiveContextMember: true,
          tone: "strong",
          label: "Already likes it",
          detail: "Direct positive signal.",
          chips: ["Liked it"],
          score: 110,
          hasDirectLike: true,
          hasDirectDislike: false,
          hasHidden: false,
          hasWatched: false,
          hasWatchlist: false,
        },
        {
          id: "katie",
          name: "Katie",
          isActiveContextMember: true,
          tone: "conflict",
          label: "Potential conflict",
          detail: "Direct negative signal.",
          chips: ["Disliked it"],
          score: -850,
          hasDirectLike: false,
          hasDirectDislike: true,
          hasHidden: false,
          hasWatched: false,
          hasWatchlist: false,
        },
        {
          id: "Palmer",
          name: "Palmer",
          isActiveContextMember: false,
          tone: "good",
          label: "Could work well",
          detail: "Positive taste signal.",
          chips: [],
          score: 82,
          hasDirectLike: false,
          hasDirectDislike: false,
          hasHidden: false,
          hasWatched: false,
          hasWatchlist: false,
        },
      ],
      groupSavedByNames: [],
      householdSavedByNames: ["Katie"],
      isWatchedByCurrentGroup: false,
    });

    expect(summary.tone).toBe("group_mixed");
    expect(summary.headline).toBe("Mixed fit for Brendan + Katie");
    expect(summary.bestForLabel).toBe("Best for Brendan");
    expect(summary.supportNote).toBe("Saved by Katie for the household.");
  });

  it("surfaces watched-together truth before overlap language", () => {
    const summary = summarizeTitleFit({
      isGroupMode: true,
      contextLabel: "Brendan + Palmer",
      memberSignals: [
        {
          id: "brendan",
          name: "Brendan",
          isActiveContextMember: true,
          tone: "strong",
          label: "Already likes it",
          detail: "Direct positive signal.",
          chips: ["Liked it"],
          score: 110,
          hasDirectLike: true,
          hasDirectDislike: false,
          hasHidden: false,
          hasWatched: true,
          hasWatchlist: false,
        },
        {
          id: "palmer",
          name: "Palmer",
          isActiveContextMember: true,
          tone: "strong",
          label: "Likes similar picks",
          detail: "Strong overlap.",
          chips: ["Watched"],
          score: 102,
          hasDirectLike: false,
          hasDirectDislike: false,
          hasHidden: false,
          hasWatched: true,
          hasWatchlist: false,
        },
      ],
      groupSavedByNames: ["Brendan"],
      householdSavedByNames: [],
      isWatchedByCurrentGroup: true,
    });

    expect(summary.tone).toBe("group_rewatch");
    expect(summary.badge).toBe("Watched together");
    expect(summary.headline).toContain("already watched this together");
  });
});

describe("deriveCompactFitLabel", () => {
  it("maps solo explanation categories into a concise card label", () => {
    expect(
      deriveCompactFitLabel({
        explanations: [
          {
            category: "genre_overlap",
            summary: "Because you usually land on sci-fi",
          },
        ],
        isGroupMode: false,
        contextLabel: "Katie",
      }),
    ).toBe("Best for Katie");
  });

  it("prefers shared-fit wording for group overlap", () => {
    expect(
      deriveCompactFitLabel({
        explanations: [
          {
            category: "group_overlap",
            summary: "Because Brendan and Palmer overlap on sci-fi",
          },
        ],
        isGroupMode: true,
        contextLabel: "Brendan + Palmer",
      }),
    ).toBe("Strong shared fit");
  });
});
