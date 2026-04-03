import { describe, expect, it } from "vitest";

import {
  canCreateHouseholdInvite,
  canRemoveHouseholdMember,
  canTransferHouseholdOwnership,
} from "@/lib/household-permissions";

describe("household permissions", () => {
  it("allows owners to create invites", () => {
    expect(canCreateHouseholdInvite("OWNER")).toBe(true);
    expect(canCreateHouseholdInvite("MEMBER")).toBe(false);
  });

  it("allows an owner to remove a member", () => {
    expect(
      canRemoveHouseholdMember({
        actorRole: "OWNER",
        targetRole: "MEMBER",
        isSelf: false,
      }),
    ).toBe(true);
  });

  it("allows an owner to transfer ownership to another member", () => {
    expect(
      canTransferHouseholdOwnership({
        actorRole: "OWNER",
        targetRole: "MEMBER",
        isSelf: false,
      }),
    ).toBe(true);
  });

  it("blocks removing yourself or another owner", () => {
    expect(
      canRemoveHouseholdMember({
        actorRole: "OWNER",
        targetRole: "MEMBER",
        isSelf: true,
      }),
    ).toBe(false);

    expect(
      canRemoveHouseholdMember({
        actorRole: "OWNER",
        targetRole: "OWNER",
        isSelf: false,
      }),
    ).toBe(false);

    expect(
      canTransferHouseholdOwnership({
        actorRole: "OWNER",
        targetRole: "MEMBER",
        isSelf: true,
      }),
    ).toBe(false);

    expect(
      canTransferHouseholdOwnership({
        actorRole: "OWNER",
        targetRole: "OWNER",
        isSelf: false,
      }),
    ).toBe(false);
  });

  it("blocks members from removing anybody", () => {
    expect(
      canRemoveHouseholdMember({
        actorRole: "MEMBER",
        targetRole: "MEMBER",
        isSelf: false,
      }),
    ).toBe(false);

    expect(
      canTransferHouseholdOwnership({
        actorRole: "MEMBER",
        targetRole: "MEMBER",
        isSelf: false,
      }),
    ).toBe(false);
  });
});
