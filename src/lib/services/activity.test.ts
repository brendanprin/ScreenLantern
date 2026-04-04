import { describe, expect, it } from "vitest";

import {
  buildGroupWatchActivityCopy,
  buildInviteCreatedActivityCopy,
  buildMemberRemovedActivityCopy,
  buildOwnershipTransferredActivityCopy,
  buildSharedSaveActivityCopy,
} from "@/lib/services/activity";

describe("buildSharedSaveActivityCopy", () => {
  it("builds group shared-save wording", () => {
    const activity = buildSharedSaveActivityCopy({
      actorName: "Brendan",
      title: "Dune",
      scope: "GROUP",
      contextLabel: "Brendan + Palmer",
      active: true,
    });

    expect(activity.type).toBe("SHARED_SAVE_ADDED");
    expect(activity.summary).toBe("Brendan saved Dune for Brendan + Palmer");
    expect(activity.detail).toBe("Shared planning pick for Brendan + Palmer.");
  });

  it("builds household shared-save removal wording", () => {
    const activity = buildSharedSaveActivityCopy({
      actorName: "Katie",
      title: "Arrival",
      scope: "HOUSEHOLD",
      contextLabel: "Lantern House",
      active: false,
    });

    expect(activity.type).toBe("SHARED_SAVE_REMOVED");
    expect(activity.summary).toBe("Katie removed Arrival from the household");
    expect(activity.detail).toBe("Removed from the household shared watchlist.");
  });
});

describe("buildGroupWatchActivityCopy", () => {
  it("uses participant names for the shared-watch summary", () => {
    const activity = buildGroupWatchActivityCopy({
      title: "Arrival",
      participantNames: ["Brendan", "Palmer"],
      contextLabel: "Brendan + Palmer",
      actorName: "Geoff",
    });

    expect(activity.summary).toBe("Brendan and Palmer watched Arrival together");
    expect(activity.detail).toBe("Marked by Geoff.");
  });
});

describe("governance activity copy", () => {
  it("builds ownership-transfer wording", () => {
    const activity = buildOwnershipTransferredActivityCopy({
      fromName: "Brendan",
      toName: "Katie",
    });

    expect(activity.summary).toBe("Ownership transferred from Brendan to Katie");
    expect(activity.detail).toBe("Katie is now the household owner.");
  });

  it("builds member-removal wording", () => {
    const activity = buildMemberRemovedActivityCopy({
      actorName: "Katie",
      removedName: "Brendan",
    });

    expect(activity.summary).toBe("Katie removed Brendan from the household");
    expect(activity.detail).toBe("Brendan was moved into a new solo household.");
  });
});

describe("buildInviteCreatedActivityCopy", () => {
  it("mentions that the invite is active until a readable time", () => {
    const activity = buildInviteCreatedActivityCopy({
      actorName: "Brendan",
      expiresAt: new Date("2026-04-10T15:30:00.000Z"),
    });

    expect(activity.summary).toBe("Brendan created a household invite");
    expect(activity.detail).toContain("A new join link is active until");
  });
});
