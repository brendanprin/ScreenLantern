import { RecommendationMode } from "@prisma/client";
import { z } from "zod";

import { titlePayloadSchema } from "@/lib/validations/title";

export const updateRecommendationContextSchema = z
  .object({
    mode: z.nativeEnum(RecommendationMode),
    selectedUserIds: z.array(z.string().min(1)).default([]),
    savedGroupId: z.string().min(1).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.mode === RecommendationMode.SOLO && value.selectedUserIds.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Solo context must target exactly one member.",
        path: ["selectedUserIds"],
      });
    }

    if (
      value.mode === RecommendationMode.GROUP &&
      !value.savedGroupId &&
      value.selectedUserIds.length < 2
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Group context must include at least two members.",
        path: ["selectedUserIds"],
      });
    }
  });

export const createGroupWatchSessionSchema = z.object({
  title: titlePayloadSchema,
});
