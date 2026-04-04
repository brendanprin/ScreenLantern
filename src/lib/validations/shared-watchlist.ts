import { z } from "zod";

import { titlePayloadSchema } from "@/lib/validations/title";

export const sharedWatchlistMutationSchema = z.object({
  title: titlePayloadSchema,
  scope: z.enum(["GROUP", "HOUSEHOLD"]),
  active: z.boolean(),
  actingUserId: z.string().min(1).optional(),
});
