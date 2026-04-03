import {
  InteractionType,
  RecommendationMode,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getRecommendationCandidatePool } from "@/lib/services/catalog";
import { getInteractionsForTaste } from "@/lib/services/interactions";
import { toTmdbKey } from "@/lib/services/title-cache";
import type {
  MediaTypeKey,
  RecommendationItem,
  TasteProfile,
  TitleSummary,
} from "@/lib/types";

function runtimeBand(runtimeMinutes?: number | null) {
  if (!runtimeMinutes) {
    return "mixed" as const;
  }

  if (runtimeMinutes <= 45) {
    return "short" as const;
  }

  if (runtimeMinutes <= 120) {
    return "medium" as const;
  }

  return "long" as const;
}

function normalizeMediaPreference(movieScore: number, tvScore: number) {
  if (Math.abs(movieScore - tvScore) <= 1) {
    return "mixed" as const;
  }

  return movieScore > tvScore ? ("movie" as const) : ("tv" as const);
}

export async function getUserTasteProfile(userId: string): Promise<TasteProfile> {
  const interactions = await getInteractionsForTaste([userId]);
  const user = interactions[0]?.user ?? (await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      preferredProviders: true,
      defaultMediaType: true,
    },
  }));

  const genreScores = new Map<string, number>();
  const dislikedTmdbKeys = new Set<string>();
  const hiddenTmdbKeys = new Set<string>();
  const watchedTmdbKeys = new Set<string>();
  let movieScore = 0;
  let tvScore = 0;
  let runtimeAccumulator = 0;
  let runtimeCount = 0;

  interactions.forEach((interaction) => {
    const weight =
      interaction.interactionType === InteractionType.LIKE
        ? 3
        : interaction.interactionType === InteractionType.WATCHED
          ? 1.5
          : interaction.interactionType === InteractionType.WATCHLIST
            ? 1
            : interaction.interactionType === InteractionType.DISLIKE
              ? -4
              : -5;

    const key = toTmdbKey(
      interaction.title.tmdbId,
      interaction.title.mediaType === "MOVIE" ? "movie" : "tv",
    );

    if (interaction.interactionType === InteractionType.DISLIKE) {
      dislikedTmdbKeys.add(key);
    }

    if (interaction.interactionType === InteractionType.HIDE) {
      hiddenTmdbKeys.add(key);
    }

    if (interaction.interactionType === InteractionType.WATCHED) {
      watchedTmdbKeys.add(key);
    }

    interaction.title.genres.forEach((genre) => {
      genreScores.set(genre, (genreScores.get(genre) ?? 0) + weight);
    });

    if (interaction.title.mediaType === "MOVIE") {
      movieScore += weight;
    } else {
      tvScore += weight;
    }

    if (
      weight > 0 &&
      interaction.title.runtimeMinutes &&
      interaction.title.runtimeMinutes > 0
    ) {
      runtimeAccumulator += interaction.title.runtimeMinutes;
      runtimeCount += 1;
    }
  });

  return {
    userIds: [userId],
    preferredGenres: [...genreScores.entries()]
      .map(([genre, score]) => ({ genre, score }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5),
    preferredProviders: user.preferredProviders,
    preferredMediaType:
      user.defaultMediaType === "MOVIE"
        ? "movie"
        : user.defaultMediaType === "TV"
          ? "tv"
          : normalizeMediaPreference(movieScore, tvScore),
    runtimePreference:
      runtimeCount > 0 ? runtimeBand(runtimeAccumulator / runtimeCount) : "mixed",
    dislikedTmdbKeys: [...dislikedTmdbKeys],
    hiddenTmdbKeys: [...hiddenTmdbKeys],
    watchedTmdbKeys: [...watchedTmdbKeys],
  };
}

export async function getGroupTasteProfile(
  userIds: string[],
): Promise<TasteProfile> {
  const profiles = await Promise.all(userIds.map((userId) => getUserTasteProfile(userId)));
  const genreScores = new Map<string, number>();
  const providerFrequency = new Map<string, number>();
  const dislikedTmdbKeys = new Set<string>();
  const hiddenTmdbKeys = new Set<string>();
  const watchedTmdbKeys = new Set<string>();
  let movieVotes = 0;
  let tvVotes = 0;
  let shortVotes = 0;
  let mediumVotes = 0;
  let longVotes = 0;

  profiles.forEach((profile) => {
    profile.preferredGenres.forEach((entry) => {
      genreScores.set(entry.genre, (genreScores.get(entry.genre) ?? 0) + entry.score);
    });

    profile.preferredProviders.forEach((provider) => {
      providerFrequency.set(provider, (providerFrequency.get(provider) ?? 0) + 1);
    });

    profile.dislikedTmdbKeys.forEach((key) => dislikedTmdbKeys.add(key));
    profile.hiddenTmdbKeys.forEach((key) => hiddenTmdbKeys.add(key));
    profile.watchedTmdbKeys.forEach((key) => watchedTmdbKeys.add(key));

    if (profile.preferredMediaType === "movie") movieVotes += 1;
    if (profile.preferredMediaType === "tv") tvVotes += 1;
    if (profile.runtimePreference === "short") shortVotes += 1;
    if (profile.runtimePreference === "medium") mediumVotes += 1;
    if (profile.runtimePreference === "long") longVotes += 1;
  });

  const preferredProviders = [...providerFrequency.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([provider]) => provider);

  const preferredMediaType = normalizeMediaPreference(movieVotes, tvVotes);
  const runtimePreference =
    shortVotes >= mediumVotes && shortVotes >= longVotes
      ? "short"
      : mediumVotes >= longVotes
        ? "medium"
        : "long";

  return {
    userIds,
    preferredGenres: [...genreScores.entries()]
      .map(([genre, score]) => ({ genre, score }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5),
    preferredProviders,
    preferredMediaType,
    runtimePreference,
    dislikedTmdbKeys: [...dislikedTmdbKeys],
    hiddenTmdbKeys: [...hiddenTmdbKeys],
    watchedTmdbKeys: [...watchedTmdbKeys],
  };
}

function scoreRuntime(
  title: TitleSummary,
  runtimePreference: TasteProfile["runtimePreference"],
) {
  if (runtimePreference === "mixed") {
    return 0;
  }

  return runtimeBand(title.runtimeMinutes) === runtimePreference ? 8 : 0;
}

export function scoreRecommendationCandidate(
  title: TitleSummary,
  profile: TasteProfile,
  mode: "solo" | "group",
) {
  const tmdbKey = toTmdbKey(title.tmdbId, title.mediaType);

  if (profile.hiddenTmdbKeys.includes(tmdbKey)) {
    return { score: -999, reasons: ["Hidden before"] };
  }

  if (profile.dislikedTmdbKeys.includes(tmdbKey)) {
    return {
      score: mode === "group" ? -950 : -850,
      reasons: [
        mode === "group"
          ? "A selected member strongly disliked this"
          : "You disliked this before",
      ],
    };
  }

  let score = (title.popularity ?? 0) * 0.22 + (title.voteAverage ?? 0) * 5;
  const reasons: string[] = [];

  const matchedGenres = title.genres
    .map((genre) => ({
      genre,
      weight:
        profile.preferredGenres.find((entry) => entry.genre === genre)?.score ?? 0,
    }))
    .filter((entry) => entry.weight > 0);

  if (matchedGenres.length > 0) {
    const genreBoost = matchedGenres.reduce(
      (sum, entry) => sum + entry.weight * 6,
      0,
    );
    score += genreBoost;
    reasons.push(
      `Matches ${matchedGenres
        .slice(0, 2)
        .map((entry) => entry.genre)
        .join(" and ")} preferences`,
    );
  }

  if (
    profile.preferredMediaType !== "mixed" &&
    title.mediaType === profile.preferredMediaType
  ) {
    score += 12;
    reasons.push(`Fits ${profile.preferredMediaType === "movie" ? "movie" : "series"} mode`);
  }

  const providerMatch = title.providers.find((provider) =>
    profile.preferredProviders.includes(provider.name),
  );

  if (providerMatch) {
    score += mode === "group" ? 14 : 10;
    reasons.push(`Available on ${providerMatch.name}`);
  }

  score += scoreRuntime(title, profile.runtimePreference);

  const releaseYear = title.releaseDate
    ? new Date(title.releaseDate).getUTCFullYear()
    : null;

  if (releaseYear && releaseYear >= 2018) {
    score += 6;
  }

  if (profile.watchedTmdbKeys.includes(tmdbKey)) {
    score -= 24;
    reasons.push("Already watched");
  }

  return { score, reasons };
}

export async function getRecommendedTitles(args: {
  userIds: string[];
  requestedById: string;
  householdId: string;
}) {
  const profile =
    args.userIds.length === 1
      ? await getUserTasteProfile(args.userIds[0])
      : await getGroupTasteProfile(args.userIds);

  const mediaTypes: MediaTypeKey[] =
    profile.preferredMediaType === "mixed"
      ? ["movie", "tv"]
      : [profile.preferredMediaType];

  const candidatePool = await getRecommendationCandidatePool({
    mediaTypes,
    genres: profile.preferredGenres.map((entry) => entry.genre),
    providers: profile.preferredProviders,
  });

  const ranked: RecommendationItem[] = candidatePool
    .map((title) => {
      const scored = scoreRecommendationCandidate(
        title,
        profile,
        args.userIds.length > 1 ? "group" : "solo",
      );

      return {
        title,
        score: scored.score,
        reasons: scored.reasons,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 18);

  await prisma.recommendationRun.create({
    data: {
      householdId: args.householdId,
      requestedById: args.requestedById,
      mode: args.userIds.length > 1 ? RecommendationMode.GROUP : RecommendationMode.SOLO,
      selectedUserIds: args.userIds,
      resultTitleIds: ranked.map((item) =>
        toTmdbKey(item.title.tmdbId, item.title.mediaType),
      ),
      explanationJson: {
        topGenres: profile.preferredGenres.slice(0, 3),
        preferredProviders: profile.preferredProviders,
      },
    },
  });

  return {
    profile,
    items: ranked,
  };
}
