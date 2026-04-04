import { z } from "zod";

export const reminderPreferencesSchema = z.object({
  enableAvailableNow: z.boolean(),
  enableWatchlistResurface: z.boolean(),
  enableGroupWatchCandidate: z.boolean(),
  enableSoloReminders: z.boolean(),
  enableGroupReminders: z.boolean(),
  aggressiveness: z.enum(["LIGHT", "BALANCED", "PROACTIVE"]),
  allowDismissedReappear: z.boolean(),
});

export type ReminderPreferencesInput = z.infer<typeof reminderPreferencesSchema>;
