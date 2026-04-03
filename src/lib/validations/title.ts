import { z } from "zod";

export const titlePayloadSchema = z.object({
  tmdbId: z.number(),
  mediaType: z.enum(["movie", "tv"]),
  title: z.string(),
  overview: z.string(),
  posterPath: z.string().nullable(),
  backdropPath: z.string().nullable(),
  releaseDate: z.string().nullable(),
  releaseYear: z.number().nullable().optional(),
  runtimeMinutes: z.number().nullable().optional(),
  genres: z.array(z.string()),
  voteAverage: z.number().nullable().optional(),
  popularity: z.number().nullable().optional(),
  providers: z.array(
    z.object({
      name: z.string(),
      id: z.number().optional(),
      logoPath: z.string().nullable().optional(),
      type: z.string().optional(),
    }),
  ),
  providerStatus: z.enum(["available", "unavailable", "unknown"]).optional(),
});
