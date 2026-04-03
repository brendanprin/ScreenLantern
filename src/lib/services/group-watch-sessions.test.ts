import { describe, expect, it } from "vitest";

import { buildParticipantKey } from "@/lib/services/group-watch-sessions";

describe("buildParticipantKey", () => {
  it("sorts and deduplicates participant ids for stable session keys", () => {
    expect(buildParticipantKey(["palmer", "brendan", "palmer"])).toBe(
      "brendan|palmer",
    );
  });
});
