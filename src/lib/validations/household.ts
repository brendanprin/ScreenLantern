import { z } from "zod";
import { HouseholdRole } from "@prisma/client";

export const createGroupSchema = z.object({
  name: z.string().min(2, "Group name must be at least 2 characters."),
  userIds: z.array(z.string()).min(2, "Choose at least 2 members."),
});

export const updateProviderPreferencesSchema = z.object({
  providers: z.array(z.string()).default([]),
});

export const createInviteSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

export const revokeInviteSchema = z.object({
  inviteId: z.string().min(1),
});

export const removeMemberSchema = z.object({
  memberId: z.string().min(1),
});

export const transferOwnershipSchema = z.object({
  memberId: z.string().min(1),
});

export const householdRoleSchema = z.nativeEnum(HouseholdRole);
