import { describe, expect, it } from "vitest";

import { buildSharedWatchlistContextKey } from "@/lib/services/shared-watchlist";

describe("buildSharedWatchlistContextKey", () => {
  it("builds a stable group context key from the selected household members", () => {
    expect(
      buildSharedWatchlistContextKey({
        scope: "GROUP",
        householdId: "household-1",
        selectedUserIds: ["palmer", "brendan", "palmer"],
      }),
    ).toBe("GROUP:brendan|palmer");
  });

  it("builds a household context key from the household id", () => {
    expect(
      buildSharedWatchlistContextKey({
        scope: "HOUSEHOLD",
        householdId: "household-1",
      }),
    ).toBe("HOUSEHOLD:household-1");
  });
});
