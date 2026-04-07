import { InteractionType, SourceContext } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  getInteractionOriginForType,
  getLibrarySourceBadge,
  getPersonalInteractionOrigin,
  getPersonalInteractionOriginLabel,
  matchesLibrarySourceFilter,
} from "@/lib/personal-interaction-sources";

describe("personal interaction sources", () => {
  it("maps imported and manual source contexts into personal origins", () => {
    expect(getPersonalInteractionOrigin(SourceContext.IMPORTED)).toBe("trakt");
    expect(getPersonalInteractionOrigin(SourceContext.NETFLIX_IMPORTED)).toBe("netflix");
    expect(getPersonalInteractionOrigin(SourceContext.MANUAL)).toBe("manual");
    expect(getPersonalInteractionOrigin(SourceContext.SOLO)).toBe("manual");
  });

  it("returns the stored origin for a specific interaction type", () => {
    expect(
      getInteractionOriginForType(
        {
          WATCHED: "trakt",
          WATCHLIST: "manual",
        },
        InteractionType.WATCHED,
      ),
    ).toBe("trakt");
    expect(
      getInteractionOriginForType(
        {
          WATCHED: "trakt",
          WATCHLIST: "manual",
        },
        InteractionType.LIKE,
      ),
    ).toBeNull();
  });

  it("matches library source filters deterministically", () => {
    expect(matchesLibrarySourceFilter("trakt", "imported")).toBe(true);
    expect(matchesLibrarySourceFilter("netflix", "imported")).toBe(true);
    expect(matchesLibrarySourceFilter("manual", "imported")).toBe(false);
    expect(matchesLibrarySourceFilter("manual", "manual")).toBe(true);
    expect(matchesLibrarySourceFilter(null, "all")).toBe(true);
  });

  it("builds concise source badges for imported and manual collection items", () => {
    expect(
      getLibrarySourceBadge({
        origin: "trakt",
        sourceFilter: "all",
      }),
    ).toBe("Imported from Trakt");
    expect(
      getLibrarySourceBadge({
        origin: "netflix",
        sourceFilter: "all",
      }),
    ).toBe("Imported from Netflix");
    expect(
      getLibrarySourceBadge({
        origin: "manual",
        sourceFilter: "manual",
      }),
    ).toBe("Added in ScreenLantern");
    expect(
      getLibrarySourceBadge({
        origin: "manual",
        sourceFilter: "all",
      }),
    ).toBeNull();
  });

  it("builds user-facing source labels for imported and manual title state", () => {
    expect(
      getPersonalInteractionOriginLabel({
        interactionType: InteractionType.WATCHED,
        origin: "trakt",
      }),
    ).toBe("Watched via Trakt sync");
    expect(
      getPersonalInteractionOriginLabel({
        interactionType: InteractionType.WATCHED,
        origin: "netflix",
      }),
    ).toBe("Watched via Netflix history sync");
    expect(
      getPersonalInteractionOriginLabel({
        interactionType: InteractionType.WATCHLIST,
        origin: "manual",
      }),
    ).toBe("Added in ScreenLantern");
  });
});
