import { InteractionType, SourceContext } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildRecommendationExplanations,
  buildTasteProfileFromInteractions,
  buildWatchlistResurfacingExplanations,
  classifySelectedServiceAvailability,
  type InteractionForTaste,
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
  importedWatchedTmdbKeys: [],
  recentlyWatchedTmdbKeys: [],
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

  it("uses a recency_signal explanation when taste signals are sparse in solo mode", () => {
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

    // With no strong signals, the recency_signal explanation fills in as a lightweight fallback.
    expect(explanations).toEqual([
      expect.objectContaining({
        category: "recency_signal",
        summary: "Reflects your recent viewing taste",
      }),
    ]);
  });

  it("falls back to generic explanation when all signals are sparse in group mode", () => {
    const explanations = buildRecommendationExplanations({
      title: {
        ...baseTitle,
        providers: [],
        genres: ["History"],
        runtimeMinutes: null,
      },
      mode: "group",
      activeNames: ["Brendan", "Palmer"],
      matchedGenres: [],
      matchedSharedGenres: [],
      providerMatch: null,
      mediaTypeMatch: false,
      runtimeMatch: false,
      previouslyWatched: false,
      groupWatchedBefore: false,
    });

    // In group mode with no signals, fresh_group_pick or fallback covers the gap.
    expect(
      explanations.some(
        (e) => e.category === "fresh_group_pick" || e.category === "fallback",
      ),
    ).toBe(true);
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
      saverCount: 1,
      source: "personal",
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
      saverCount: 2,
      source: "personal",
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
      saverCount: 1,
      source: "personal",
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
      source: "personal",
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

  it("prefers group-shared explanation language when the title was saved for the active group", () => {
    const explanations = buildWatchlistResurfacingExplanations({
      title: baseTitle,
      mode: "group",
      activeNames: ["Brendan", "Palmer"],
      savedByNames: ["Brendan"],
      source: "shared_group",
      savedContextLabel: "Brendan + Palmer",
      availabilityMatch: "selected_services",
      matchedGenres: ["Science Fiction"],
      matchedSharedGenres: ["Science Fiction"],
      mediaTypeMatch: true,
      runtimeMatch: false,
    });

    expect(explanations[0]).toEqual(
      expect.objectContaining({
        category: "watchlist_resurface",
        summary: "Saved for Brendan + Palmer and available now",
      }),
    );
    expect(explanations[0]?.detail).toContain(
      "added this to the shared watchlist for Brendan + Palmer",
    );
  });

  it("uses household-shared explanation language when the title was saved for the household", () => {
    const explanations = buildWatchlistResurfacingExplanations({
      title: baseTitle,
      mode: "group",
      activeNames: ["Brendan", "Palmer"],
      savedByNames: ["Katie"],
      source: "shared_household",
      availabilityMatch: "other_services",
      matchedGenres: [],
      matchedSharedGenres: [],
      mediaTypeMatch: false,
      runtimeMatch: false,
    });

    expect(explanations[0]).toEqual(
      expect.objectContaining({
        category: "watchlist_resurface",
        summary: "Saved by Katie for the household",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers for buildTasteProfileFromInteractions tests
// ---------------------------------------------------------------------------

const baseUser = {
  id: "user-1",
  name: "Tester",
  preferredProviders: ["Max"],
  defaultMediaType: null,
};

function makeInteraction(
  overrides: Partial<{
    tmdbId: number;
    interactionType: InteractionType;
    sourceContext: SourceContext;
    genres: string[];
    mediaType: "MOVIE" | "TV";
    runtimeMinutes: number | null;
    updatedAt: Date;
  }> = {},
): InteractionForTaste {
  const now = new Date();
  return {
    id: "interaction-1",
    userId: "user-1",
    titleCacheId: "tc-1",
    interactionType: overrides.interactionType ?? InteractionType.LIKE,
    sourceContext: overrides.sourceContext ?? SourceContext.MANUAL,
    groupRunId: null,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    title: {
      id: "tc-1",
      tmdbId: overrides.tmdbId ?? 1,
      mediaType: overrides.mediaType ?? "MOVIE",
      title: "Test Movie",
      overview: "",
      posterPath: null,
      backdropPath: null,
      releaseDate: new Date("2023-01-01"),
      runtimeMinutes: overrides.runtimeMinutes ?? 100,
      genres: overrides.genres ?? ["Drama"],
      voteAverage: 7.5,
      popularity: 50,
      providerSnapshot: null,
      metadataJson: null,
      lastSyncedAt: now,
    },
    user: { ...baseUser },
  } as unknown as InteractionForTaste;
}

describe("buildTasteProfileFromInteractions — source-aware weights", () => {
  it("manual LIKE produces higher genre score than imported LIKE for the same genre", () => {
    const manualProfile = buildTasteProfileFromInteractions(
      "user-1",
      [makeInteraction({ interactionType: InteractionType.LIKE, sourceContext: SourceContext.MANUAL })],
      baseUser,
    );
    const importedProfile = buildTasteProfileFromInteractions(
      "user-1",
      [makeInteraction({ interactionType: InteractionType.LIKE, sourceContext: SourceContext.IMPORTED })],
      baseUser,
    );

    const manualScore = manualProfile.preferredGenres.find((g) => g.genre === "Drama")?.score ?? 0;
    const importedScore = importedProfile.preferredGenres.find((g) => g.genre === "Drama")?.score ?? 0;

    expect(manualScore).toBeGreaterThan(importedScore);
    expect(importedScore).toBeGreaterThan(0);
  });

  it("Netflix WATCHED is added to importedWatchedTmdbKeys", () => {
    const profile = buildTasteProfileFromInteractions(
      "user-1",
      [
        makeInteraction({
          tmdbId: 42,
          interactionType: InteractionType.WATCHED,
          sourceContext: SourceContext.NETFLIX_IMPORTED,
        }),
      ],
      baseUser,
    );

    expect(profile.importedWatchedTmdbKeys).toContain("movie:42");
    expect(profile.watchedTmdbKeys).toContain("movie:42");
  });

  it("manual WATCHED is NOT added to importedWatchedTmdbKeys", () => {
    const profile = buildTasteProfileFromInteractions(
      "user-1",
      [
        makeInteraction({
          tmdbId: 42,
          interactionType: InteractionType.WATCHED,
          sourceContext: SourceContext.MANUAL,
        }),
      ],
      baseUser,
    );

    expect(profile.importedWatchedTmdbKeys).not.toContain("movie:42");
    expect(profile.watchedTmdbKeys).toContain("movie:42");
  });
});

describe("buildTasteProfileFromInteractions — recency decay", () => {
  it("recent interaction (< 14 days) produces higher genre score than stale interaction (> 365 days)", () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // 400 days ago

    const recentProfile = buildTasteProfileFromInteractions(
      "user-1",
      [makeInteraction({ interactionType: InteractionType.LIKE, updatedAt: recentDate })],
      baseUser,
    );
    const staleProfile = buildTasteProfileFromInteractions(
      "user-1",
      [makeInteraction({ interactionType: InteractionType.LIKE, updatedAt: staleDate })],
      baseUser,
    );

    const recentScore = recentProfile.preferredGenres.find((g) => g.genre === "Drama")?.score ?? 0;
    const staleScore = staleProfile.preferredGenres.find((g) => g.genre === "Drama")?.score ?? 0;

    expect(recentScore).toBeGreaterThan(staleScore);
  });

  it("WATCHED within 30 days is added to recentlyWatchedTmdbKeys", () => {
    const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const profile = buildTasteProfileFromInteractions(
      "user-1",
      [
        makeInteraction({
          tmdbId: 55,
          interactionType: InteractionType.WATCHED,
          updatedAt: recentDate,
        }),
      ],
      baseUser,
    );

    expect(profile.recentlyWatchedTmdbKeys).toContain("movie:55");
  });

  it("WATCHED older than 30 days is NOT added to recentlyWatchedTmdbKeys", () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const profile = buildTasteProfileFromInteractions(
      "user-1",
      [
        makeInteraction({
          tmdbId: 55,
          interactionType: InteractionType.WATCHED,
          updatedAt: oldDate,
        }),
      ],
      baseUser,
    );

    expect(profile.recentlyWatchedTmdbKeys).not.toContain("movie:55");
    expect(profile.watchedTmdbKeys).toContain("movie:55");
  });
});

describe("scoreRecommendationCandidate — tiered watched suppression", () => {
  const baseScoreNoHistory = scoreRecommendationCandidate(baseTitle, baseProfile, { mode: "solo" }).score;

  it("manual watched applies mild -24 suppression", () => {
    const result = scoreRecommendationCandidate(
      baseTitle,
      { ...baseProfile, watchedTmdbKeys: ["movie:99"] },
      { mode: "solo" },
    );
    expect(baseScoreNoHistory - result.score).toBeCloseTo(24, 0);
  });

  it("imported watched applies stronger -48 suppression", () => {
    const result = scoreRecommendationCandidate(
      baseTitle,
      {
        ...baseProfile,
        watchedTmdbKeys: ["movie:99"],
        importedWatchedTmdbKeys: ["movie:99"],
      },
      { mode: "solo" },
    );
    expect(baseScoreNoHistory - result.score).toBeCloseTo(48, 0);
  });

  it("recently watched applies strongest -65 suppression", () => {
    const result = scoreRecommendationCandidate(
      baseTitle,
      {
        ...baseProfile,
        watchedTmdbKeys: ["movie:99"],
        importedWatchedTmdbKeys: ["movie:99"],
        recentlyWatchedTmdbKeys: ["movie:99"],
      },
      { mode: "solo" },
    );
    expect(baseScoreNoHistory - result.score).toBeCloseTo(65, 0);
  });

  it("recently watched suppression is stronger than imported watched suppression", () => {
    const importedResult = scoreRecommendationCandidate(
      baseTitle,
      {
        ...baseProfile,
        watchedTmdbKeys: ["movie:99"],
        importedWatchedTmdbKeys: ["movie:99"],
      },
      { mode: "solo" },
    );
    const recentResult = scoreRecommendationCandidate(
      baseTitle,
      {
        ...baseProfile,
        watchedTmdbKeys: ["movie:99"],
        recentlyWatchedTmdbKeys: ["movie:99"],
      },
      { mode: "solo" },
    );
    expect(recentResult.score).toBeLessThan(importedResult.score);
  });
});

describe("buildRecommendationExplanations — watch history language", () => {
  const baseArgs = {
    title: baseTitle,
    mode: "solo" as const,
    activeNames: ["Brendan"],
    matchedGenres: [],
    matchedSharedGenres: [],
    providerMatch: null,
    mediaTypeMatch: false,
    runtimeMatch: false,
    previouslyWatched: false,
    groupWatchedBefore: false,
  };

  it("recentlyWatched produces 'watched this recently' language", () => {
    const explanations = buildRecommendationExplanations({
      ...baseArgs,
      previouslyWatched: true,
      recentlyWatched: true,
    });
    expect(explanations.some((e) => e.category === "watch_history")).toBe(true);
    const watchExp = explanations.find((e) => e.category === "watch_history");
    expect(watchExp?.summary).toMatch(/recently/i);
  });

  it("importedWatched produces 'imported_history' category and import language", () => {
    const explanations = buildRecommendationExplanations({
      ...baseArgs,
      previouslyWatched: true,
      importedWatched: true,
    });
    expect(explanations.some((e) => e.category === "imported_history")).toBe(true);
    const importExp = explanations.find((e) => e.category === "imported_history");
    expect(importExp?.summary).toMatch(/imported viewing history/i);
  });

  it("manual watched (no recent/imported flags) produces classic 'watched before' language", () => {
    const explanations = buildRecommendationExplanations({
      ...baseArgs,
      previouslyWatched: true,
    });
    const watchExp = explanations.find((e) => e.category === "watch_history");
    expect(watchExp?.summary).toMatch(/watched this before/i);
  });
});
