import { describe, expect, it } from "vitest";

import {
  buildRecommendationExplanations,
  buildWatchlistResurfacingExplanations,
  classifySelectedServiceAvailability,
  scoreRecommendationCandidate,
  scoreWatchlistResurfacingCandidate,
} from "@/lib/services/recommendations";
import type { TasteProfile, TitleSummary } from "@/lib/types";

const baseTitle: TitleSummary = {
  tmdbId: 99,
  mediaType: "movie",
  title: "Test Title",
  overview: "A candidate title for recommendation scoring tests.",
  posterPath: null,
  backdropPath: null,
  releaseDate: "2024-01-01",
  runtimeMinutes: 110,
  genres: ["Science Fiction", "Drama"],
  voteAverage: 8.2,
  popularity: 80,
  providers: [{ name: "Max" }],
  providerStatus: "available",
};

const baseProfile: TasteProfile = {
  userIds: ["user-1"],
  preferredGenres: [
    { genre: "Science Fiction", score: 3 },
    { genre: "Drama", score: 2 },
  ],
  preferredProviders: ["Max"],
  preferredMediaType: "movie",
  runtimePreference: "medium",
  dislikedTmdbKeys: [],
  hiddenTmdbKeys: [],
  watchedTmdbKeys: [],
};

describe("scoreRecommendationCandidate", () => {
  it("rewards genre, provider, media type, and runtime matches with structured explanations", () => {
    const result = scoreRecommendationCandidate(baseTitle, baseProfile, {
      mode: "solo",
    });

    expect(result.score).toBeGreaterThan(100);
    expect(result.explanations.map((item) => item.category)).toEqual([
      "genre_overlap",
      "provider_match",
      "runtime_fit",
    ]);
    expect(result.explanations[0].summary).toMatch(/because you usually land on/i);
  });

  it("strongly penalizes disliked titles in group mode", () => {
    const result = scoreRecommendationCandidate(
      baseTitle,
      {
        ...baseProfile,
        dislikedTmdbKeys: ["movie:99"],
      },
      {
        mode: "group",
        activeNames: ["Brendan", "Palmer"],
      },
    );

    expect(result.score).toBeLessThan(-900);
    expect(result.explanations[0].summary).toMatch(/strongly disliked/i);
  });

  it("removes hidden titles from viable recommendations", () => {
    const result = scoreRecommendationCandidate(
      baseTitle,
      {
        ...baseProfile,
        hiddenTmdbKeys: ["movie:99"],
      },
      {
        mode: "solo",
      },
    );

    expect(result.score).toBe(-999);
    expect(result.explanations[0].detail).toMatch(/removed from viable/i);
  });

  it("surfaces exact-group watch history without dropping positive context", () => {
    const result = scoreRecommendationCandidate(baseTitle, baseProfile, {
      mode: "group",
      activeNames: ["Brendan", "Palmer"],
      sharedGenres: ["Science Fiction"],
      groupWatchedBefore: true,
    });

    expect(result.explanations[0].category).toBe("group_watch_history");
    expect(result.explanations).toHaveLength(3);
    expect(result.explanations.some((item) => item.category === "group_overlap")).toBe(
      true,
    );
  });
});

describe("buildRecommendationExplanations", () => {
  it("builds overlap-oriented group explanations with active member names", () => {
    const explanations = buildRecommendationExplanations({
      title: baseTitle,
      mode: "group",
      activeNames: ["Brendan", "Palmer"],
      matchedGenres: ["Science Fiction", "Drama"],
      matchedSharedGenres: ["Science Fiction", "Drama"],
      providerMatch: "Max",
      mediaTypeMatch: false,
      runtimeMatch: false,
      previouslyWatched: false,
      groupWatchedBefore: false,
    });

    expect(explanations[0].category).toBe("group_overlap");
    expect(explanations[0].summary).toContain("Brendan and Palmer");
    expect(explanations[0].summary).toMatch(/sci-fi and drama/i);
    expect(explanations[1].category).toBe("provider_match");
  });

  it("falls back to a lightweight explanation when signals are sparse", () => {
    const explanations = buildRecommendationExplanations({
      title: {
        ...baseTitle,
        providers: [],
        genres: ["History"],
        runtimeMinutes: null,
      },
      mode: "solo",
      activeNames: ["Brendan"],
      matchedGenres: [],
      matchedSharedGenres: [],
      providerMatch: null,
      mediaTypeMatch: false,
      runtimeMatch: false,
      previouslyWatched: false,
      groupWatchedBefore: false,
    });

    expect(explanations).toEqual([
      expect.objectContaining({
        category: "fallback",
        summary: "Worth a look for your current profile",
      }),
    ]);
  });
});

describe("classifySelectedServiceAvailability", () => {
  it("distinguishes selected-service availability from other services", () => {
    expect(classifySelectedServiceAvailability(baseTitle, ["Max"])).toBe(
      "selected_services",
    );
    expect(classifySelectedServiceAvailability(baseTitle, ["Hulu"])).toBe(
      "other_services",
    );
  });

  it("treats unknown provider data as unknown instead of available", () => {
    expect(
      classifySelectedServiceAvailability(
        {
          ...baseTitle,
          providers: [],
          providerStatus: "unknown",
        },
        ["Max"],
      ),
    ).toBe("unknown");
  });
});

describe("scoreWatchlistResurfacingCandidate", () => {
  it("builds a solo watchlist resurfacing candidate with available-now explanation", () => {
    const result = scoreWatchlistResurfacingCandidate({
      title: baseTitle,
      profile: baseProfile,
      mode: "solo",
      activeNames: ["Brendan"],
      savedByNames: ["Brendan"],
      currentContextWatched: false,
      groupWatchedBefore: false,
    });

    expect(result).not.toBeNull();
    expect(result?.badges).toEqual(["Available now"]);
    expect(result?.explanations[0]).toEqual(
      expect.objectContaining({
        category: "watchlist_resurface",
        summary: "Saved to your watchlist and available on your services",
      }),
    );
  });

  it("builds group watchlist resurfacing reasons around shared fit", () => {
    const result = scoreWatchlistResurfacingCandidate({
      title: baseTitle,
      profile: baseProfile,
      mode: "group",
      activeNames: ["Brendan", "Palmer"],
      savedByNames: ["Brendan", "Palmer"],
      sharedGenres: ["Science Fiction"],
      currentContextWatched: false,
      groupWatchedBefore: false,
    });

    expect(result).not.toBeNull();
    expect(result?.explanations[0].summary).toContain("Brendan and Palmer");
    expect(
      result?.explanations.some((item) => item.category === "group_overlap"),
    ).toBe(true);
  });

  it("suppresses watchlist resurfacing when the exact current group already watched it", () => {
    const result = scoreWatchlistResurfacingCandidate({
      title: baseTitle,
      profile: baseProfile,
      mode: "group",
      activeNames: ["Brendan", "Palmer"],
      savedByNames: ["Palmer"],
      currentContextWatched: false,
      groupWatchedBefore: true,
    });

    expect(result).toBeNull();
  });
});

describe("buildWatchlistResurfacingExplanations", () => {
  it("falls back to watchlist-first language when provider signals are sparse", () => {
    const explanations = buildWatchlistResurfacingExplanations({
      title: {
        ...baseTitle,
        providers: [],
        providerStatus: "unknown",
      },
      mode: "solo",
      activeNames: ["Brendan"],
      savedByNames: ["Brendan"],
      availabilityMatch: "unknown",
      matchedGenres: [],
      matchedSharedGenres: [],
      mediaTypeMatch: false,
      runtimeMatch: false,
    });

    expect(explanations[0]).toEqual(
      expect.objectContaining({
        category: "watchlist_resurface",
        summary: "Back on your radar from your watchlist",
      }),
    );
  });
});
