import { RecommendationMode } from "@prisma/client";
import { z } from "zod";

const booleanishParam = z
  .string()
  .optional()
  .transform((value) => value === "1" || value === "true");

export const reminderQuerySchema = z.object({
  userIds: z
    .string()
    .optional()
    .transform((value) => value?.split(",").filter(Boolean) ?? []),
  mode: z.nativeEnum(RecommendationMode).optional(),
  savedGroupId: z.string().min(1).optional(),
  refresh: booleanishParam,
  summary: booleanishParam,
});
