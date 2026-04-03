import { z } from "zod";

export const signUpSchema = z.object({
  onboardingMode: z.enum(["create", "join"]).default("create"),
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  householdName: z
    .string()
    .min(2, "Household name must be at least 2 characters.")
    .optional()
    .or(z.literal("")),
  inviteCode: z.string().optional().or(z.literal("")),
}).superRefine((value, ctx) => {
  if (value.onboardingMode === "join" && !value.inviteCode?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inviteCode"],
      message: "Enter a valid invite code.",
    });
  }
});

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
