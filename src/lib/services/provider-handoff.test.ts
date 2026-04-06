import { describe, expect, it } from "vitest";

import { buildTitleHandoff } from "@/lib/services/provider-handoff";
import type { TitleSummary } from "@/lib/types";

const BASE_TITLE: TitleSummary = {
  tmdbId: 11,
  mediaType: "movie",
  title: "Dune",
  overview: "A desert epic.",
  posterPath: null,
  backdropPath: null,
  releaseDate: "2021-10-22",
  releaseYear: 2021,
  runtimeMinutes: 155,
  genres: ["Science Fiction"],
  voteAverage: 8,
  popularity: 90,
  providers: [],
  providerStatus: "available",
};

describe("buildTitleHandoff", () => {
  it("prioritizes openable selected services first", () => {
    const handoff = buildTitleHandoff(
      {
        ...BASE_TITLE,
        providers: [
          { name: "Max", type: "flatrate" },
          { name: "Netflix", type: "flatrate" },
        ],
      },
      ["Netflix"],
      "US",
    );

    expect(handoff.status).toBe("openable");
    expect(handoff.selectedAvailability).toBe("selected_services");
    expect(handoff.primaryOption?.providerName).toBe("Netflix");
    expect(handoff.openableOptions.map((option) => option.providerName)).toEqual([
      "Netflix",
      "Max",
    ]);
  });

  it("supports multiple openable services when more than one reliable handoff exists", () => {
    const handoff = buildTitleHandoff(
      {
        ...BASE_TITLE,
        providers: [
          { name: "Max", type: "flatrate" },
          { name: "Netflix", type: "flatrate" },
          { name: "Prime Video", type: "rent" },
        ],
      },
      [],
      "US",
    );

    expect(handoff.status).toBe("openable");
    expect(handoff.openableOptions).toHaveLength(3);
    expect(handoff.openableOptions[0]?.providerName).toBe("Max");
  });

  it("falls back honestly when provider availability exists but no reliable direct link does", () => {
    const handoff = buildTitleHandoff(
      {
        ...BASE_TITLE,
        title: "Andor",
        providers: [{ name: "Disney Plus", type: "flatrate" }],
      },
      ["Disney Plus"],
      "US",
    );

    expect(handoff.status).toBe("availability_only");
    expect(handoff.primaryOption).toBeNull();
    expect(handoff.fallbackMessage).toBe(
      "Available on your services, but direct open is unavailable.",
    );
  });

  it("treats unknown provider data distinctly from unavailable providers", () => {
    const handoff = buildTitleHandoff(
      {
        ...BASE_TITLE,
        providers: [],
        providerStatus: "unknown",
      },
      ["Max"],
      "US",
    );

    expect(handoff.status).toBe("unknown");
    expect(handoff.fallbackMessage).toBe(
      "Provider availability is currently unavailable for US.",
    );
  });

  it("uses availability-only fallback when no providers are found in the current region", () => {
    const handoff = buildTitleHandoff(
      {
        ...BASE_TITLE,
        providers: [],
        providerStatus: "unavailable",
      },
      ["Max"],
      "US",
    );

    expect(handoff.status).toBe("unavailable");
    expect(handoff.fallbackMessage).toBe("No watch providers were found for US.");
  });
});
