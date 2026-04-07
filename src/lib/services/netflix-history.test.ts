import { describe, expect, it } from "vitest";

import {
  parseNetflixViewingHistoryCsv,
  summarizeNetflixHistoryImport,
} from "@/lib/services/netflix-history-shared";

describe("netflix history parsing", () => {
  it("parses Netflix CSV rows into title entries", () => {
    expect(
      parseNetflixViewingHistoryCsv(`Title,Date
"The Office: Season 2: The Dundies","2026-04-05"
"Palm Springs","2026-04-04"`),
    ).toEqual([
      {
        title: "The Office: Season 2: The Dundies",
        watchedAt: "2026-04-05T00:00:00.000Z",
      },
      {
        title: "Palm Springs",
        watchedAt: "2026-04-04T00:00:00.000Z",
      },
    ]);
  });

  it("builds a compact import summary", () => {
    expect(
      summarizeNetflixHistoryImport({
        imported: 4,
        alreadyPresent: 2,
        unmatched: 1,
        scanned: 7,
        recentImports: [],
        unmatchedTitles: [],
      }),
    ).toBe("Netflix history sync scanned 7 unique titles: 4 imported, 2 already present, 1 unmatched.");
  });
});
