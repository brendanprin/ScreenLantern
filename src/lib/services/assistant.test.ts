import { describe, expect, it } from "vitest";

import {
  collectRecentlySuggestedKeys,
  extractPseudoToolCallFromContent,
  hasNegativeAssistantInteraction,
  normalizeMediaTypeValue,
  normalizeMoodValue,
  normalizeRecommendationLikeArgs,
  normalizeSearchArgs,
} from "@/lib/services/assistant";

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
});
