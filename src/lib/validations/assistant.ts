import { z } from "zod";

export const assistantMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Ask for a recommendation or refinement.")
    .max(500, "Keep each assistant prompt under 500 characters."),
});
