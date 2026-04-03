import { InteractionType, Prisma, RecommendationMode } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getRecommendationCandidatePool,
  hydrateProvidersForTitles,
} from "@/lib/services/catalog";
import { getGroupWatchedTmdbKeys } from "@/lib/services/group-watch-sessions";
import { getInteractionsForTaste } from "@/lib/services/interactions";
import { mapTitleCacheToSummary, toTmdbKey } from "@/lib/services/title-cache";
import type {
  MediaTypeKey,
  RecommendationExplanation,
  RecommendationItem,
  RecommendationLane,
  TasteProfile,
  TitleSummary,
} from "@/lib/types";

type RecommendationModeShape = "solo" | "group";
type SelectedServiceAvailability =
  | "selected_services"
  | "other_services"
  | "unavailable"
  | "unknown";

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

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function formatGenres(genres: string[]) {
  const friendlyNames: Record<string, string> = {
    "Science Fiction": "sci-fi",
    "Action & Adventure": "action and adventure",
    "Sci-Fi & Fantasy": "sci-fi and fantasy",
    "War & Politics": "war and politics",
  };

  return formatList(
    genres.map((genre) => (friendlyNames[genre] ?? genre).toLowerCase()),
  );
}

function addExplanation(
  explanations: RecommendationExplanation[],
  explanation: RecommendationExplanation,
) {
  if (explanations.some((item) => item.category === explanation.category)) {
    return;
  }

  explanations.push(explanation);
}

function buildGroupSharedGenres(profiles: TasteProfile[]) {
  const counts = new Map<string, number>();
  const scoreTotals = new Map<string, number>();
  const threshold = profiles.length > 1 ? 2 : 1;

  profiles.forEach((profile) => {
    profile.preferredGenres
      .filter((entry) => entry.score > 0)
      .slice(0, 4)
      .forEach((entry) => {
        counts.set(entry.genre, (counts.get(entry.genre) ?? 0) + 1);
        scoreTotals.set(entry.genre, (scoreTotals.get(entry.genre) ?? 0) + entry.score);
      });
  });

  return [...counts.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return (scoreTotals.get(right[0]) ?? 0) - (scoreTotals.get(left[0]) ?? 0);
    })
    .map(([genre]) => genre)
    .slice(0, 4);
}

function buildGroupTasteProfileFromProfiles(profiles: TasteProfile[]): TasteProfile {
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
    userIds: profiles.flatMap((profile) => profile.userIds),
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

async function getGroupTasteProfileWithSignals(userIds: string[]) {
  const memberProfiles = await Promise.all(
    userIds.map((userId) => getUserTasteProfile(userId)),
  );

  return {
    profile: buildGroupTasteProfileFromProfiles(memberProfiles),
    sharedGenres: buildGroupSharedGenres(memberProfiles),
  };
}

export async function getUserTasteProfile(userId: string): Promise<TasteProfile> {
  const interactions = await getInteractionsForTaste([userId]);
  const user =
    interactions[0]?.user ??
    (await prisma.user.findUniqueOrThrow({
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

export async function getGroupTasteProfile(userIds: string[]): Promise<TasteProfile> {
  return (await getGroupTasteProfileWithSignals(userIds)).profile;
}

function getTitlePreferenceSignals(args: {
  title: TitleSummary;
  profile: TasteProfile;
  sharedGenres?: string[];
}) {
  const matchedGenres = args.title.genres
    .map((genre) => ({
      genre,
      weight:
        args.profile.preferredGenres.find((entry) => entry.genre === genre)?.score ?? 0,
    }))
    .filter((entry) => entry.weight > 0);
  const matchedSharedGenres = matchedGenres
    .map((entry) => entry.genre)
    .filter((genre) => (args.sharedGenres ?? []).includes(genre));
  const providerMatch =
    args.title.providers.find((provider) =>
      args.profile.preferredProviders.includes(provider.name),
    )?.name ?? null;
  const mediaTypeMatch =
    args.profile.preferredMediaType !== "mixed" &&
    args.title.mediaType === args.profile.preferredMediaType;
  const runtimeMatch =
    args.profile.runtimePreference !== "mixed" &&
    runtimeBand(args.title.runtimeMinutes) === args.profile.runtimePreference;

  return {
    matchedGenres,
    matchedSharedGenres,
    providerMatch,
    mediaTypeMatch,
    runtimeMatch,
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

export function classifySelectedServiceAvailability(
  title: TitleSummary,
  preferredProviders: string[],
): SelectedServiceAvailability {
  if (title.providerStatus === "unknown") {
    return "unknown";
  }

  if (title.providerStatus !== "available") {
    return "unavailable";
  }

  return title.providers.some((provider) => preferredProviders.includes(provider.name))
    ? "selected_services"
    : "other_services";
}

export function buildRecommendationExplanations(args: {
  title: TitleSummary;
  mode: RecommendationModeShape;
  activeNames: string[];
  matchedGenres: string[];
  matchedSharedGenres: string[];
  providerMatch: string | null;
  mediaTypeMatch: boolean;
  runtimeMatch: boolean;
  previouslyWatched: boolean;
  groupWatchedBefore: boolean;
}): RecommendationExplanation[] {
  const explanations: RecommendationExplanation[] = [];
  const namesLabel =
    args.mode === "group" && args.activeNames.length > 0
      ? formatList(args.activeNames)
      : "this group";

  if (args.groupWatchedBefore) {
    addExplanation(explanations, {
      category: "group_watch_history",
      summary: "This group watched it together before",
      detail:
        "It may still work as a rewatch, but it is not a fresh shared pick.",
    });
  }

  if (args.mode === "group" && args.matchedSharedGenres.length > 0) {
    addExplanation(explanations, {
      category: "group_overlap",
      summary: `Because ${namesLabel} overlap on ${formatGenres(
        args.matchedSharedGenres.slice(0, 2),
      )}`,
      detail:
        "This leans into genres that more than one selected member tends to enjoy.",
    });
  } else if (args.matchedGenres.length > 0) {
    addExplanation(explanations, {
      category: "genre_overlap",
      summary:
        args.mode === "solo"
          ? `Because you usually land on ${formatGenres(
              args.matchedGenres.slice(0, 2),
            )}`
          : `Because it lines up with this group's strongest ${formatGenres(
              args.matchedGenres.slice(0, 2),
            )} signals`,
      detail:
        args.mode === "solo"
          ? "Those genres show up most often in your positive taste signals."
          : "That helps keep it closer to a safe-overlap group pick than a one-sided choice.",
    });
  }

  if (args.providerMatch) {
    addExplanation(explanations, {
      category: "provider_match",
      summary:
        args.mode === "solo"
          ? "Available on your selected services"
          : "Available on services this group already uses",
      detail:
        args.mode === "solo"
          ? `It is available on ${args.providerMatch}.`
          : `It is available on ${args.providerMatch}, which helps keep it practical for ${namesLabel}.`,
    });
  }

  if (args.runtimeMatch) {
    addExplanation(explanations, {
      category: "runtime_fit",
      summary:
        args.mode === "solo"
          ? `Good fit for your usual ${
              args.title.mediaType === "movie" ? "movie length" : "episode length"
            }`
          : "Good fit for this group's usual runtime",
      detail: "Its runtime lines up well with what this context tends to pick.",
    });
  }

  if (args.mediaTypeMatch) {
    addExplanation(explanations, {
      category: "media_fit",
      summary:
        args.mode === "solo"
          ? `Fits your current ${args.title.mediaType === "movie" ? "movie" : "series"} mode`
          : `Fits this group's current ${
              args.title.mediaType === "movie" ? "movie" : "series"
            } lean`,
      detail:
        args.mode === "solo"
          ? "Your recent taste signals lean toward this kind of pick right now."
          : "The selected members are leaning toward this format in the current context.",
    });
  }

  if (args.previouslyWatched) {
    addExplanation(explanations, {
      category: "watch_history",
      summary:
        args.mode === "solo"
          ? "You have watched this before"
          : "At least one selected member has already seen this",
      detail:
        "It can still work as a rewatch, but ScreenLantern usually prefers fresher options.",
    });
  }

  if (args.mode === "group" && !args.groupWatchedBefore && explanations.length < 2) {
    addExplanation(explanations, {
      category: "fresh_group_pick",
      summary: "This exact group has not watched it together yet",
      detail:
        "That makes it a fresher option for this room than a known group rewatch.",
    });
  }

  if (explanations.length === 0) {
    addExplanation(explanations, {
      category: "fallback",
      summary:
        args.mode === "solo"
          ? "Worth a look for your current profile"
          : "Could be a safe-overlap option for this group",
      detail:
        args.mode === "solo"
          ? "It does not rely on one standout signal, but it still fits the shape of your recommendations."
          : "It does not spike on one member's taste, which helps keep it room-friendly.",
    });
  }

  return explanations.slice(0, 3);
}

export function buildWatchlistResurfacingExplanations(args: {
  title: TitleSummary;
  mode: RecommendationModeShape;
  activeNames: string[];
  savedByNames: string[];
  availabilityMatch: SelectedServiceAvailability;
  matchedGenres: string[];
  matchedSharedGenres: string[];
  mediaTypeMatch: boolean;
  runtimeMatch: boolean;
}): RecommendationExplanation[] {
  const explanations: RecommendationExplanation[] = [];
  const namesLabel =
    args.mode === "group" && args.activeNames.length > 0
      ? formatList(args.activeNames)
      : "this group";
  const savedByLabel =
    args.mode === "group" && args.savedByNames.length > 0
      ? formatList(args.savedByNames)
      : null;

  addExplanation(explanations, {
    category: "watchlist_resurface",
    summary:
      args.mode === "solo"
        ? args.availabilityMatch === "selected_services"
          ? "Saved to your watchlist and available on your services"
          : "Back on your radar from your watchlist"
        : args.availabilityMatch === "selected_services"
          ? `${savedByLabel ?? "Saved"} and available for ${namesLabel} now`
          : savedByLabel
            ? `Saved by ${savedByLabel} for ${namesLabel}`
            : `Back on ${namesLabel}'s radar`,
    detail:
      args.mode === "solo"
        ? args.availabilityMatch === "selected_services"
          ? "It is currently practical to start from the services tied to this profile."
          : "You already saved it, and it still lines up with the shape of your current picks."
        : savedByLabel
          ? `${savedByLabel} already saved this, so it is worth bringing back into the room conversation.`
          : "It is already in this group's orbit, so ScreenLantern is bringing it back into view.",
  });

  const tasteExplanations = buildRecommendationExplanations({
    title: args.title,
    mode: args.mode,
    activeNames: args.activeNames,
    matchedGenres: args.matchedGenres,
    matchedSharedGenres: args.matchedSharedGenres,
    providerMatch: null,
    mediaTypeMatch: args.mediaTypeMatch,
    runtimeMatch: args.runtimeMatch,
    previouslyWatched: false,
    groupWatchedBefore: false,
  });

  tasteExplanations.forEach((explanation) => {
    if (explanations.length >= 3) {
      return;
    }

    addExplanation(explanations, explanation);
  });

  return explanations.slice(0, 3);
}

export function scoreWatchlistResurfacingCandidate(args: {
  title: TitleSummary;
  profile: TasteProfile;
  mode: RecommendationModeShape;
  activeNames: string[];
  savedByNames: string[];
  sharedGenres?: string[];
  currentContextWatched: boolean;
  groupWatchedBefore: boolean;
}): RecommendationItem | null {
  const tmdbKey = toTmdbKey(args.title.tmdbId, args.title.mediaType);

  if (
    args.profile.hiddenTmdbKeys.includes(tmdbKey) ||
    args.profile.dislikedTmdbKeys.includes(tmdbKey) ||
    args.currentContextWatched ||
    args.groupWatchedBefore
  ) {
    return null;
  }

  const {
    matchedGenres,
    matchedSharedGenres,
    mediaTypeMatch,
    runtimeMatch,
  } = getTitlePreferenceSignals({
    title: args.title,
    profile: args.profile,
    sharedGenres: args.sharedGenres,
  });
  const availabilityMatch = classifySelectedServiceAvailability(
    args.title,
    args.profile.preferredProviders,
  );

  let score = 48 + Math.min(args.savedByNames.length, 3) * 8;

  if (matchedGenres.length > 0) {
    score += matchedGenres.reduce((sum, entry) => sum + entry.weight * 5, 0);
  }

  if (mediaTypeMatch) {
    score += 10;
  }

  if (runtimeMatch) {
    score += 6;
  }

  if (matchedSharedGenres.length > 0) {
    score += matchedSharedGenres.length * 7;
  }

  if (availabilityMatch === "selected_services") {
    score += 24;
  } else if (availabilityMatch === "unknown") {
    score -= 4;
  } else if (availabilityMatch === "unavailable") {
    score -= 6;
  }

  const releaseYear = args.title.releaseDate
    ? new Date(args.title.releaseDate).getUTCFullYear()
    : null;

  if (releaseYear && releaseYear >= 2018) {
    score += 4;
  }

  return {
    title: args.title,
    score,
    explanations: buildWatchlistResurfacingExplanations({
      title: args.title,
      mode: args.mode,
      activeNames: args.activeNames,
      savedByNames: args.savedByNames,
      availabilityMatch,
      matchedGenres: matchedGenres.map((entry) => entry.genre),
      matchedSharedGenres,
      mediaTypeMatch,
      runtimeMatch,
    }),
    badges: availabilityMatch === "selected_services" ? ["Available now"] : [],
  };
}

export function scoreRecommendationCandidate(
  title: TitleSummary,
  profile: TasteProfile,
  options: {
    mode: RecommendationModeShape;
    activeNames?: string[];
    sharedGenres?: string[];
    groupWatchedBefore?: boolean;
  },
): { score: number; explanations: RecommendationExplanation[] } {
  const tmdbKey = toTmdbKey(title.tmdbId, title.mediaType);
  const {
    matchedGenres,
    matchedSharedGenres,
    providerMatch,
    mediaTypeMatch,
    runtimeMatch,
  } = getTitlePreferenceSignals({
    title,
    profile,
    sharedGenres: options.sharedGenres,
  });
  const previouslyWatched = profile.watchedTmdbKeys.includes(tmdbKey);
  const groupWatchedBefore = Boolean(options.groupWatchedBefore);

  if (profile.hiddenTmdbKeys.includes(tmdbKey)) {
    return {
      score: -999,
      explanations: [
        {
          category: "watch_history",
          summary: "You hid this before",
          detail: "Hidden titles are removed from viable recommendation candidates.",
        },
      ],
    };
  }

  if (profile.dislikedTmdbKeys.includes(tmdbKey)) {
    return {
      score: options.mode === "group" ? -950 : -850,
      explanations: [
        {
          category: "watch_history",
          summary:
            options.mode === "group"
              ? "A selected member strongly disliked this"
              : "You disliked this before",
          detail:
            "Strong dislikes are heavily penalized so they do not keep resurfacing.",
        },
      ],
    };
  }

  let score = (title.popularity ?? 0) * 0.22 + (title.voteAverage ?? 0) * 5;

  if (matchedGenres.length > 0) {
    score += matchedGenres.reduce((sum, entry) => sum + entry.weight * 6, 0);
  }

  if (mediaTypeMatch) {
    score += 12;
  }

  if (providerMatch) {
    score += options.mode === "group" ? 14 : 10;
  }

  score += scoreRuntime(title, profile.runtimePreference);

  const releaseYear = title.releaseDate
    ? new Date(title.releaseDate).getUTCFullYear()
    : null;

  if (releaseYear && releaseYear >= 2018) {
    score += 6;
  }

  if (previouslyWatched) {
    score -= 24;
  }

  if (groupWatchedBefore) {
    score -= 36;
  }

  return {
    score,
    explanations: buildRecommendationExplanations({
      title,
      mode: options.mode,
      activeNames: options.activeNames ?? [],
      matchedGenres: matchedGenres.map((entry) => entry.genre),
      matchedSharedGenres,
      providerMatch,
      mediaTypeMatch,
      runtimeMatch,
      previouslyWatched,
      groupWatchedBefore,
    }),
  };
}

async function getRecommendationContextData(args: {
  userIds: string[];
  householdId: string;
}) {
  const selectedUsersPromise = prisma.user.findMany({
    where: {
      householdId: args.householdId,
      id: { in: args.userIds },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const { profile, sharedGenres } =
    args.userIds.length === 1
      ? {
          profile: await getUserTasteProfile(args.userIds[0]),
          sharedGenres: [] as string[],
        }
      : await getGroupTasteProfileWithSignals(args.userIds);

  const selectedUsers = await selectedUsersPromise;
  const activeNames = args.userIds
    .map((userId) => selectedUsers.find((user) => user.id === userId)?.name)
    .filter((name): name is string => Boolean(name));
  const groupWatchedKeys =
    args.userIds.length > 1
      ? await getGroupWatchedTmdbKeys({
          householdId: args.householdId,
          userIds: args.userIds,
        })
      : new Set<string>();

  return {
    mode: args.userIds.length > 1 ? ("group" as const) : ("solo" as const),
    profile,
    sharedGenres,
    activeNames,
    groupWatchedKeys,
  };
}

async function getWatchlistRecommendationLanes(args: {
  userIds: string[];
  householdId: string;
  mode: RecommendationModeShape;
  activeNames: string[];
  profile: TasteProfile;
  sharedGenres: string[];
  groupWatchedKeys: Set<string>;
}) {
  const watchlistInteractions = await prisma.userTitleInteraction.findMany({
    where: {
      interactionType: InteractionType.WATCHLIST,
      userId: { in: args.userIds },
      user: {
        householdId: args.householdId,
      },
    },
    include: {
      title: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 40,
  });

  if (watchlistInteractions.length === 0) {
    return [] as RecommendationLane[];
  }

  const grouped = new Map<
    string,
    {
      title: TitleSummary;
      savedByNames: Set<string>;
      latestUpdatedAt: Date;
    }
  >();

  watchlistInteractions.forEach((interaction) => {
    const title = mapTitleCacheToSummary(interaction.title as never);
    const key = toTmdbKey(title.tmdbId, title.mediaType);
    const existing = grouped.get(key);

    if (existing) {
      existing.savedByNames.add(interaction.user.name);

      if (interaction.updatedAt > existing.latestUpdatedAt) {
        existing.latestUpdatedAt = interaction.updatedAt;
      }

      return;
    }

    grouped.set(key, {
      title,
      savedByNames: new Set([interaction.user.name]),
      latestUpdatedAt: interaction.updatedAt,
    });
  });

  const hydratedTitles = await hydrateProvidersForTitles(
    [...grouped.values()].map((entry) => entry.title),
    {
      refreshStale: true,
    },
  );
  const hydratedByKey = new Map(
    hydratedTitles.map((title) => [toTmdbKey(title.tmdbId, title.mediaType), title]),
  );

  const ranked = [...grouped.entries()]
    .map(([key, candidate]) => {
      const title = hydratedByKey.get(key) ?? candidate.title;

      return {
        item: scoreWatchlistResurfacingCandidate({
          title,
          profile: args.profile,
          mode: args.mode,
          activeNames: args.activeNames,
          savedByNames: [...candidate.savedByNames].sort((left, right) =>
            left.localeCompare(right),
          ),
          sharedGenres: args.sharedGenres,
          currentContextWatched:
            args.mode === "solo" ? args.profile.watchedTmdbKeys.includes(key) : false,
          groupWatchedBefore:
            args.mode === "group" ? args.groupWatchedKeys.has(key) : false,
        }),
        latestUpdatedAt: candidate.latestUpdatedAt,
        availabilityMatch: classifySelectedServiceAvailability(
          title,
          args.profile.preferredProviders,
        ),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        item: RecommendationItem;
        latestUpdatedAt: Date;
        availabilityMatch: SelectedServiceAvailability;
      } => Boolean(entry.item),
    )
    .sort((left, right) => {
      if (right.item.score !== left.item.score) {
        return right.item.score - left.item.score;
      }

      return right.latestUpdatedAt.getTime() - left.latestUpdatedAt.getTime();
    });

  const availableNowItems = ranked
    .filter((entry) => entry.availabilityMatch === "selected_services")
    .map((entry) => entry.item)
    .slice(0, 4);
  const usedKeys = new Set(
    availableNowItems.map((item) => toTmdbKey(item.title.tmdbId, item.title.mediaType)),
  );
  const backOnRadarItems = ranked
    .filter(
      (entry) =>
        !usedKeys.has(toTmdbKey(entry.item.title.tmdbId, entry.item.title.mediaType)),
    )
    .map((entry) => entry.item)
    .slice(0, 4);

  const lanes: RecommendationLane[] = [];

  if (availableNowItems.length > 0) {
    lanes.push({
      id: "available_now",
      title: "Available now on your services",
      description:
        args.mode === "group"
          ? "Saved titles that this active group can actually start from the services already in play."
          : "Saved titles that are currently practical to start from the services tied to this profile.",
      items: availableNowItems,
    });
  }

  if (backOnRadarItems.length > 0) {
    lanes.push({
      id: "back_on_your_radar",
      title: "Back on your radar",
      description:
        args.mode === "group"
          ? "Saved titles from the selected members that still fit tonight and have not been watched by this exact group."
          : "Saved titles that still fit this profile and have not been watched here yet.",
      items: backOnRadarItems,
    });
  }

  return lanes;
}

export async function getRecommendedTitles(args: {
  userIds: string[];
  requestedById: string;
  householdId: string;
}) {
  const context = await getRecommendationContextData({
    userIds: args.userIds,
    householdId: args.householdId,
  });
  const { profile, sharedGenres, activeNames, groupWatchedKeys, mode } = context;

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
      const scored = scoreRecommendationCandidate(title, profile, {
        mode,
        activeNames,
        sharedGenres,
        groupWatchedBefore: groupWatchedKeys.has(
          toTmdbKey(title.tmdbId, title.mediaType),
        ),
      });

      return {
        title,
        score: scored.score,
        explanations: scored.explanations,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 18);
  const lanes = await getWatchlistRecommendationLanes({
    userIds: args.userIds,
    householdId: args.householdId,
    mode,
    activeNames,
    profile,
    sharedGenres,
    groupWatchedKeys,
  });

  const explanationJson = {
    topGenres: profile.preferredGenres.slice(0, 3),
    preferredProviders: profile.preferredProviders,
    items: ranked.map((item) => ({
      tmdbKey: toTmdbKey(item.title.tmdbId, item.title.mediaType),
      explanations: item.explanations,
    })),
    lanes: lanes.map((lane) => ({
      id: lane.id,
      items: lane.items.map((item) => ({
        tmdbKey: toTmdbKey(item.title.tmdbId, item.title.mediaType),
        explanations: item.explanations,
      })),
    })),
  } as unknown as Prisma.InputJsonValue;

  await prisma.recommendationRun.create({
    data: {
      householdId: args.householdId,
      requestedById: args.requestedById,
      mode: mode === "group" ? RecommendationMode.GROUP : RecommendationMode.SOLO,
      selectedUserIds: args.userIds,
      resultTitleIds: ranked.map((item) =>
        toTmdbKey(item.title.tmdbId, item.title.mediaType),
      ),
      explanationJson,
    },
  });

  return {
    profile,
    items: ranked,
    lanes,
  };
}
