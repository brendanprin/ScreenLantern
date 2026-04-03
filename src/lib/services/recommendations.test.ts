import { describe, expect, it } from "vitest";

import { scoreRecommendationCandidate } from "@/lib/services/recommendations";
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
  it("rewards genre, provider, media type, and runtime matches", () => {
    const result = scoreRecommendationCandidate(baseTitle, baseProfile, "solo");

    expect(result.score).toBeGreaterThan(100);
    expect(result.reasons).toContain("Available on Max");
  });

  it("strongly penalizes disliked titles in group mode", () => {
    const result = scoreRecommendationCandidate(
      baseTitle,
      {
        ...baseProfile,
        dislikedTmdbKeys: ["movie:99"],
      },
      "group",
    );

    expect(result.score).toBeLessThan(-900);
    expect(result.reasons[0]).toMatch(/strongly disliked/i);
  });

  it("removes hidden titles from viable recommendations", () => {
    const result = scoreRecommendationCandidate(
      baseTitle,
      {
        ...baseProfile,
        hiddenTmdbKeys: ["movie:99"],
      },
      "solo",
    );

    expect(result.score).toBe(-999);
  });
});

