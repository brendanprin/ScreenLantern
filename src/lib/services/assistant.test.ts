import { describe, expect, it } from "vitest";

import {
  buildDefaultAssistantThreadState,
  buildHeuristicToolArgs,
  buildLastRecommendationFromCards,
  buildToolArgsFromThreadState,
  collectRejectedTitleKeys,
  collectRecentlySuggestedKeys,
  extractPseudoToolCallFromContent,
  hasNegativeAssistantInteraction,
  isLikelyRefinementMessage,
  normalizeMediaTypeValue,
  normalizeMoodValue,
  normalizeRecommendationLikeArgs,
  normalizeSearchArgs,
  parseAssistantIntentMessage,
} from "@/lib/services/assistant";

function createAssistantCard(title: string, tmdbId: number) {
  return {
    id: `card-${tmdbId}`,
    source: "recommendation" as const,
    sourceLabel: "Recommended for you",
    title: {
      tmdbId,
      mediaType: "movie" as const,
      title,
      overview: "",
      posterPath: null,
      backdropPath: null,
      releaseDate: null,
      genres: [],
      providers: [],
    },
    handoff: null,
    recommendationExplanations: [
      {
        category: "fallback" as const,
        summary: "It matches the current ask.",
        detail: null,
      },
    ],
    recommendationBadges: [],
  };
}

describe("assistant tool argument normalization", () => {
  it("coerces fuzzy media type strings into known movie or tv values", () => {
    expect(normalizeMediaTypeValue("movie")).toBe("movie");
    expect(normalizeMediaTypeValue("feature film")).toBe("movie");
    expect(normalizeMediaTypeValue("tv series")).toBe("tv");
  });

  it("maps romance and rom-com phrasing into the romantic mood bucket", () => {
    expect(normalizeMoodValue("romantic comedy")).toBe("romantic");
    expect(normalizeMoodValue("rom-com")).toBe("romantic");
    expect(normalizeMoodValue("funny")).toBe("funny");
  });

  it("moves invalid media-type mood strings into mood instead of crashing recommendation parsing", () => {
    expect(
      normalizeRecommendationLikeArgs({
        mediaType: "romantic comedy",
        mood: null,
      }),
    ).toEqual({
      mediaType: null,
      mood: "romantic",
    });
  });

  it("coerces numeric and provider-array recommendation args from local-model tool payloads", () => {
    expect(
      normalizeRecommendationLikeArgs({
        limit: "10",
        runtimeMax: "120",
        provider: ["Amazon Prime Video"],
        onlyOnPreferredProviders: "true",
        excludeWatched: "false",
      }),
    ).toEqual({
      limit: 10,
      runtimeMax: 120,
      provider: "Amazon Prime Video",
      onlyOnPreferredProviders: true,
      excludeWatched: false,
    });
  });

  it("drops invalid search media types instead of preserving malformed values", () => {
    expect(
      normalizeSearchArgs({
        query: "When Harry Met Sally",
        mediaType: "romantic comedy",
      }),
    ).toEqual({
      query: "When Harry Met Sally",
      mediaType: null,
    });
  });

  it("coerces search limits from local-model string values", () => {
    expect(
      normalizeSearchArgs({
        query: "Severance",
        limit: "5",
      }),
    ).toEqual({
      query: "Severance",
      limit: 5,
    });
  });

  it("extracts pseudo tool calls from plain-text assistant content", () => {
    expect(
      extractPseudoToolCallFromContent(`I couldn't find any funny movies under 2 hours due to the limited runtime filter. I'll try again with a different limit.

{"name":"get_recommended_titles","parameters":{"limit":"10","mediaType":"movie","mood":"funny","provider":["Amazon Prime Video"]}}`),
    ).toEqual({
      name: "get_recommended_titles",
      parameters: {
        limit: "10",
        mediaType: "movie",
        mood: "funny",
        provider: ["Amazon Prime Video"],
      },
    });
  });

  it("collects recently suggested title keys from the latest assistant card messages", () => {
    const keys = collectRecentlySuggestedKeys([
      {
        id: "u1",
        role: "user",
        text: "What should I watch?",
        createdAt: "2026-04-06T12:00:00.000Z",
        cards: [],
      },
      {
        id: "a1",
        role: "assistant",
        text: "Try these.",
        createdAt: "2026-04-06T12:00:01.000Z",
        cards: [
          {
            id: "card-1",
            source: "recommendation",
            sourceLabel: "Recommended for you",
            title: {
              tmdbId: 11,
              mediaType: "movie",
              title: "Dune",
              overview: "",
              posterPath: null,
              backdropPath: null,
              releaseDate: null,
              genres: [],
              providers: [],
            },
            handoff: null,
            recommendationExplanations: [],
            recommendationBadges: [],
          },
        ],
      },
    ]);

    expect(keys.has("movie:11")).toBe(true);
  });

  it("treats hidden and disliked items as negative assistant candidates even on saved flows", () => {
    expect(
      hasNegativeAssistantInteraction({
        hasHidden: true,
        hasDisliked: false,
      }),
    ).toBe(true);
    expect(
      hasNegativeAssistantInteraction({
        hasHidden: false,
        hasDisliked: true,
      }),
    ).toBe(true);
    expect(
      hasNegativeAssistantInteraction({
        hasHidden: false,
        hasDisliked: false,
      }),
    ).toBe(false);
  });

  it("treats 'Why those?' as a follow-up explanation request for prior recommendation cards", () => {
    expect(
      parseAssistantIntentMessage({
        message: "Why those?",
        previousCards: [createAssistantCard("The Devil Wears Prada", 11)],
      }).wantsWhyThis,
    ).toBe(true);
  });

  it("treats short constraint changes as refinements when there is prior thread state", () => {
    const parsed = parseAssistantIntentMessage({
      message: "Only movies",
      previousCards: [createAssistantCard("Dune", 11)],
    });

    expect(
      isLikelyRefinementMessage({
        message: "Only movies",
        hasPriorState: true,
        parsed,
      }),
    ).toBe(true);
  });

  it("stores the last shown recommendation set for future why/different follow-ups", () => {
    expect(
      buildLastRecommendationFromCards([
        createAssistantCard("Dune", 11),
        createAssistantCard("Arrival", 12),
      ]),
    ).toEqual({
      titleKeys: ["movie:11", "movie:12"],
      sourceLabel: "Recommended for you",
    });
  });

  it("adds the prior recommendation set to rejected memory for different follow-ups", () => {
    const state = buildDefaultAssistantThreadState();
    state.lastRecommendation = {
      titleKeys: ["movie:11", "movie:12"],
      sourceLabel: "Recommended for you",
    };

    expect(collectRejectedTitleKeys(state, [])).toEqual(["movie:11", "movie:12"]);
  });

  it("builds tool args from persisted thread state instead of starting over", () => {
    const state = buildDefaultAssistantThreadState();
    state.constraints.mediaType = "movie";
    state.constraints.mood = "funny";
    state.constraints.runtimeMax = 120;
    state.constraints.onlyOnPreferredProviders = true;
    state.constraints.excludeWatched = true;
    state.sourceScope = "watchlist";
    state.lastRecommendation = {
      titleKeys: ["movie:11", "movie:12", "movie:13"],
      sourceLabel: "Saved already",
    };

    const parsed = parseAssistantIntentMessage({
      message: "Give me 3 different ones",
      previousCards: [createAssistantCard("Dune", 11)],
    });

    expect(buildToolArgsFromThreadState(state, parsed)).toEqual({
      limit: 3,
      mediaType: "movie",
      runtimeMax: 120,
      onlyOnPreferredProviders: true,
      provider: null,
      mood: "funny",
      referenceTmdbId: null,
      referenceMediaType: null,
      excludeWatched: true,
      practicalTonight: false,
    });
  });

  it("treats watchlist scope-switch follow-ups as refinements", () => {
    const parsed = parseAssistantIntentMessage({
      message: "What about from our watchlist?",
      previousCards: [createAssistantCard("Dune", 11)],
    });

    expect(parsed.wantsWatchlist).toBe(true);
    expect(
      isLikelyRefinementMessage({
        message: "What about from our watchlist?",
        hasPriorState: true,
        parsed,
      }),
    ).toBe(true);
  });

  it("treats 'Not those' as a rejection follow-up for the current recommendation set", () => {
    const parsed = parseAssistantIntentMessage({
      message: "Not those",
      previousCards: [createAssistantCard("Dune", 11)],
    });

    expect(parsed.wantsRejectPrevious).toBe(true);
    expect(
      isLikelyRefinementMessage({
        message: "Not those",
        hasPriorState: true,
        parsed,
      }),
    ).toBe(true);
  });

  it("treats the full surfaced current-ask set as rejected when asking for different options", () => {
    const state = buildDefaultAssistantThreadState();
    state.lastRecommendation = {
      titleKeys: ["movie:21", "movie:22", "movie:23"],
      sourceLabel: "Recommended for you",
    };
    state.shownTitleKeys = ["movie:11", "movie:12", "movie:13", "movie:21", "movie:22", "movie:23"];

    expect(collectRejectedTitleKeys(state, [])).toEqual([
      "movie:11",
      "movie:12",
      "movie:13",
      "movie:21",
      "movie:22",
      "movie:23",
    ]);
  });

  it("recognizes broad tonight asks as a practical recommendation constraint", () => {
    const parsed = parseAssistantIntentMessage({
      message: "What should I watch tonight?",
      previousCards: [],
    });

    expect(parsed.wantsTonight).toBe(true);
    expect(buildHeuristicToolArgs(parsed, [])).toEqual({
      limit: 3,
      mediaType: null,
      runtimeMax: null,
      onlyOnPreferredProviders: false,
      mood: null,
      excludeWatched: false,
      practicalTonight: true,
    });
  });
});
