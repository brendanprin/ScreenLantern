import type { HouseholdRole } from "@prisma/client";

export function canManageHousehold(role: HouseholdRole) {
  return role === "OWNER";
}

export function canCreateHouseholdInvite(role: HouseholdRole) {
  return role === "OWNER";
}

export function canTransferHouseholdOwnership(args: {
  actorRole: HouseholdRole;
  targetRole: HouseholdRole;
  isSelf: boolean;
}) {
  if (args.actorRole !== "OWNER") {
    return false;
  }

  if (args.isSelf) {
    return false;
  }

  return args.targetRole === "MEMBER";
}

export function canRemoveHouseholdMember(args: {
  actorRole: HouseholdRole;
  targetRole: HouseholdRole;
  isSelf: boolean;
}) {
  if (args.actorRole !== "OWNER") {
    return false;
  }

  if (args.isSelf) {
    return false;
  }

  return args.targetRole !== "OWNER";
}
