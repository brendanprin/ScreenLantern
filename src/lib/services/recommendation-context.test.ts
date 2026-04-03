import { describe, expect, it } from "vitest";

import { resolveRecommendationContextState } from "@/lib/services/recommendation-context";

const householdMembers = [
  { id: "brendan", name: "Brendan" },
  { id: "katie", name: "Katie" },
  { id: "palmer", name: "Palmer" },
];

const savedGroups = [
  {
    id: "group-1",
    name: "Brendan + Palmer",
    userIds: ["brendan", "palmer"],
  },
];

describe("resolveRecommendationContextState", () => {
  it("restores a persisted solo profile context", () => {
    const resolved = resolveRecommendationContextState({
      viewerUserId: "brendan",
      householdMembers,
      savedGroups,
      storedContext: {
        mode: "SOLO",
        selectedUserIds: ["katie"],
        savedGroupId: null,
      },
    });

    expect(resolved.context.mode).toBe("SOLO");
    expect(resolved.context.selectedUserIds).toEqual(["katie"]);
    expect(resolved.context.activeNames).toEqual(["Katie"]);
    expect(resolved.context.isGroupMode).toBe(false);
  });

  it("restores a persisted saved-group context", () => {
    const resolved = resolveRecommendationContextState({
      viewerUserId: "brendan",
      householdMembers,
      savedGroups,
      storedContext: {
        mode: "GROUP",
        selectedUserIds: ["palmer", "brendan"],
        savedGroupId: "group-1",
      },
    });

    expect(resolved.context.mode).toBe("GROUP");
    expect(resolved.context.savedGroupId).toBe("group-1");
    expect(resolved.context.selectedUserIds).toEqual(["brendan", "palmer"]);
    expect(resolved.context.source).toBe("saved_group");
  });

  it("falls back to the viewer's solo context when a saved group is stale", () => {
    const resolved = resolveRecommendationContextState({
      viewerUserId: "brendan",
      householdMembers,
      savedGroups: [],
      storedContext: {
        mode: "GROUP",
        selectedUserIds: ["brendan", "palmer"],
        savedGroupId: "missing-group",
      },
    });

    expect(resolved.context.mode).toBe("SOLO");
    expect(resolved.context.selectedUserIds).toEqual(["brendan"]);
    expect(resolved.wasNormalized).toBe(true);
  });

  it("falls back safely when an ad hoc group no longer has enough valid members", () => {
    const resolved = resolveRecommendationContextState({
      viewerUserId: "brendan",
      householdMembers,
      savedGroups,
      storedContext: {
        mode: "GROUP",
        selectedUserIds: ["brendan", "removed-member"],
        savedGroupId: null,
      },
    });

    expect(resolved.context.mode).toBe("SOLO");
    expect(resolved.context.selectedUserIds).toEqual(["brendan"]);
    expect(resolved.wasNormalized).toBe(true);
  });
});
