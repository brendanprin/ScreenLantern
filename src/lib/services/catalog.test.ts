import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDiscoverRequest,
  normalizeProviderAvailability,
  normalizeTitleSummary,
} from "@/lib/services/catalog";

const ORIGINAL_ENV = { ...process.env };

async function importCatalogWithEnv(envOverrides: Record<string, string | undefined>) {
  process.env = {
    ...ORIGINAL_ENV,
    ...envOverrides,
  };
  vi.resetModules();

  return import("@/lib/services/catalog");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe("buildDiscoverRequest", () => {
  it("uses movie-specific year and newest sort params", () => {
    const request = buildDiscoverRequest(
      {
        mediaType: "movie",
        year: 2024,
        runtimeMax: 140,
        sortBy: "newest.desc",
      },
      {
        genreId: 28,
        providerId: 8,
      },
    );

    expect(request.path).toBe("/discover/movie");
    expect(request.params.primary_release_year).toBe(2024);
    expect(request.params.first_air_date_year).toBeUndefined();
    expect(request.params.sort_by).toBe("primary_release_date.desc");
    expect(request.params["with_runtime.lte"]).toBe(140);
    expect(request.params.with_watch_providers).toBe(8);
    expect(request.params.watch_region).toBe("US");
  });

  it("uses tv-specific year and newest sort params", () => {
    const request = buildDiscoverRequest(
      {
        mediaType: "tv",
        year: 2022,
        runtimeMax: 45,
        sortBy: "newest.desc",
      },
      {
        genreId: 18,
      },
    );

    expect(request.path).toBe("/discover/tv");
    expect(request.params.first_air_date_year).toBe(2022);
    expect(request.params.primary_release_year).toBeUndefined();
    expect(request.params.sort_by).toBe("first_air_date.desc");
    expect(request.params["with_runtime.lte"]).toBe(45);
    expect(request.params.with_genres).toBe(18);
  });
});

describe("normalizeProviderAvailability", () => {
  it("normalizes provider buckets across streaming and transactional availability", () => {
    const normalized = normalizeProviderAvailability({
      results: {
        US: {
          flatrate: [
            {
              provider_id: 8,
              provider_name: "Netflix",
              logo_path: "/netflix.png",
            },
          ],
          buy: [
            {
              provider_id: 2,
              provider_name: "Apple TV",
              logo_path: "/apple.png",
            },
          ],
        },
      },
    });

    expect(normalized.providerStatus).toBe("available");
    expect(normalized.providers).toEqual([
      {
        id: 8,
        name: "Netflix",
        logoPath: "/netflix.png",
        type: "flatrate",
      },
      {
        id: 2,
        name: "Apple TV",
        logoPath: "/apple.png",
        type: "buy",
      },
    ]);
  });

  it("treats missing region data as unknown instead of unavailable", () => {
    const normalized = normalizeProviderAvailability({
      results: {
        CA: {
          flatrate: [
            {
              provider_id: 15,
              provider_name: "Crave",
            },
          ],
        },
      },
    });

    expect(normalized.providerStatus).toBe("unknown");
    expect(normalized.providers).toEqual([]);
  });
});

describe("normalizeTitleSummary", () => {
  it("uses honest tv fields instead of movie release/runtime fields", () => {
    const summary = normalizeTitleSummary(
      {
        id: 101,
        media_type: "tv",
        name: "Example Show",
        title: "Wrong Movie Title",
        overview: "A show summary",
        poster_path: null,
        backdrop_path: null,
        release_date: "2021-01-01",
        first_air_date: "2022-09-21",
        runtime: 120,
        episode_run_time: [47],
        genre_ids: [18],
      },
      {
        genreNameMap: new Map([[18, "Drama"]]),
      },
    );

    expect(summary.mediaType).toBe("tv");
    expect(summary.title).toBe("Example Show");
    expect(summary.releaseDate).toBe("2022-09-21");
    expect(summary.releaseYear).toBe(2022);
    expect(summary.runtimeMinutes).toBe(47);
    expect(summary.genres).toEqual(["Drama"]);
  });
});

describe("live-mode hardening", () => {
  it("returns a safe notice when TMDb search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { searchTitles } = await importCatalogWithEnv({
      TMDB_API_KEY: "test-key",
      TMDB_USE_MOCK_DATA: "0",
    });

    const results = await searchTitles({
      query: "Dune",
      mediaType: "movie",
      page: 1,
    });

    expect(results.source).toBe("live");
    expect(results.results).toEqual([]);
    expect(results.notice).toMatch(/could not refresh live tmdb results/i);
  });

  it("reuses the provider catalog cache across calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          results: [
            { provider_id: 8, provider_name: "Netflix", display_priority: 1 },
            { provider_id: 15, provider_name: "Hulu", display_priority: 2 },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { getProviderOptions } = await importCatalogWithEnv({
      TMDB_API_KEY: "test-key",
      TMDB_USE_MOCK_DATA: "0",
    });

    const first = await getProviderOptions("movie");
    const second = await getProviderOptions("movie");

    expect(first).toEqual(["Hulu", "Netflix"]);
    expect(second).toEqual(["Hulu", "Netflix"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps mock mode isolated from live fetch behavior", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { discoverTitles } = await importCatalogWithEnv({
      TMDB_API_KEY: "",
      TMDB_USE_MOCK_DATA: "1",
    });

    const results = await discoverTitles({
      mediaType: "movie",
      genre: "Action",
      sortBy: "newest.desc",
    });

    expect(results.source).toBe("mock");
    expect(results.results.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
