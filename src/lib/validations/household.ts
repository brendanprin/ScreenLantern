import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().min(2, "Group name must be at least 2 characters."),
  userIds: z.array(z.string()).min(2, "Choose at least 2 members."),
});

export const updateProviderPreferencesSchema = z.object({
  providers: z.array(z.string()).default([]),
});

