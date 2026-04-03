import { z } from "zod";

export const searchParamsSchema = z.object({
  query: z.string().default(""),
  page: z.coerce.number().int().min(1).default(1),
  mediaType: z.enum(["all", "movie", "tv"]).default("all"),
});

export const discoverParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  mediaType: z.enum(["movie", "tv"]).default("movie"),
  genre: z.string().optional().default(""),
  year: z
    .union([z.coerce.number().int().min(1900).max(2100), z.literal("")])
    .optional()
    .default(""),
  runtimeMax: z
    .union([z.coerce.number().int().min(30).max(400), z.literal("")])
    .optional()
    .default(""),
  provider: z.string().optional().default(""),
  sortBy: z
    .enum(["popularity.desc", "vote_average.desc", "newest.desc"])
    .default("popularity.desc"),
});
