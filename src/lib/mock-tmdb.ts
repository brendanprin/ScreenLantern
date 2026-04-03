import {
  type DiscoverTitlesInput,
  type MediaTypeKey,
  type PagedResult,
  type TitleDetails,
  type TitleSummary,
} from "@/lib/types";
import { dedupeByKey } from "@/lib/utils";

const MOCK_TITLES: TitleDetails[] = [
  {
    tmdbId: 11,
    mediaType: "movie",
    title: "Dune",
    overview:
      "A gifted young nobleman must navigate destiny, empire, and survival on the desert planet Arrakis.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2021-10-22",
    runtimeMinutes: 155,
    genres: ["Science Fiction", "Adventure", "Drama"],
    voteAverage: 7.8,
    popularity: 92,
    providers: [{ name: "Max" }, { name: "Netflix" }],
    cast: [
      { name: "Timothee Chalamet", character: "Paul Atreides" },
      { name: "Zendaya", character: "Chani" },
    ],
    seasons: [],
  },
  {
    tmdbId: 12,
    mediaType: "movie",
    title: "Arrival",
    overview:
      "A linguist leads the effort to communicate with mysterious visitors whose arrival changes the world.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2016-11-11",
    runtimeMinutes: 116,
    genres: ["Science Fiction", "Drama", "Mystery"],
    voteAverage: 7.7,
    popularity: 77,
    providers: [{ name: "Prime Video" }, { name: "Paramount Plus" }],
    cast: [
      { name: "Amy Adams", character: "Louise Banks" },
      { name: "Jeremy Renner", character: "Ian Donnelly" },
    ],
    seasons: [],
  },
  {
    tmdbId: 13,
    mediaType: "movie",
    title: "Paddington 2",
    overview:
      "Paddington's search for the perfect present becomes a caper that brings a neighborhood together.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2018-01-12",
    runtimeMinutes: 103,
    genres: ["Comedy", "Family", "Adventure"],
    voteAverage: 8.1,
    popularity: 61,
    providers: [{ name: "Netflix" }, { name: "Hulu" }],
    cast: [
      { name: "Ben Whishaw", character: "Paddington" },
      { name: "Hugh Grant", character: "Phoenix Buchanan" },
    ],
    seasons: [],
  },
  {
    tmdbId: 14,
    mediaType: "movie",
    title: "Knives Out",
    overview:
      "A detective unravels a wealthy family's secrets after a celebrated novelist dies under suspicious circumstances.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2019-11-27",
    runtimeMinutes: 130,
    genres: ["Mystery", "Comedy", "Crime"],
    voteAverage: 7.9,
    popularity: 86,
    providers: [{ name: "Prime Video" }, { name: "Peacock" }],
    cast: [
      { name: "Daniel Craig", character: "Benoit Blanc" },
      { name: "Ana de Armas", character: "Marta Cabrera" },
    ],
    seasons: [],
  },
  {
    tmdbId: 15,
    mediaType: "movie",
    title: "Palm Springs",
    overview:
      "Two wedding guests get trapped in a time loop and discover that connection may be the only way forward.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2020-07-10",
    runtimeMinutes: 90,
    genres: ["Comedy", "Romance", "Science Fiction"],
    voteAverage: 7.4,
    popularity: 59,
    providers: [{ name: "Hulu" }],
    cast: [
      { name: "Andy Samberg", character: "Nyles" },
      { name: "Cristin Milioti", character: "Sarah" },
    ],
    seasons: [],
  },
  {
    tmdbId: 16,
    mediaType: "movie",
    title: "Mad Max: Fury Road",
    overview:
      "A runaway convoy races through the wasteland in a relentless battle for freedom and survival.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2015-05-15",
    runtimeMinutes: 120,
    genres: ["Action", "Adventure", "Science Fiction"],
    voteAverage: 8.1,
    popularity: 88,
    providers: [{ name: "Max" }],
    cast: [
      { name: "Charlize Theron", character: "Furiosa" },
      { name: "Tom Hardy", character: "Max Rockatansky" },
    ],
    seasons: [],
  },
  {
    tmdbId: 17,
    mediaType: "movie",
    title: "Oppenheimer",
    overview:
      "The story of J. Robert Oppenheimer and the choices that shaped the atomic age.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2023-07-21",
    runtimeMinutes: 180,
    genres: ["Drama", "History", "Thriller"],
    voteAverage: 8.3,
    popularity: 95,
    providers: [{ name: "Peacock" }, { name: "Prime Video" }],
    cast: [
      { name: "Cillian Murphy", character: "J. Robert Oppenheimer" },
      { name: "Emily Blunt", character: "Kitty Oppenheimer" },
    ],
    seasons: [],
  },
  {
    tmdbId: 18,
    mediaType: "movie",
    title: "Spider-Man: Into the Spider-Verse",
    overview:
      "Miles Morales steps into the multiverse and discovers what it really means to wear the mask.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2018-12-14",
    runtimeMinutes: 117,
    genres: ["Animation", "Action", "Adventure"],
    voteAverage: 8.4,
    popularity: 84,
    providers: [{ name: "Netflix" }, { name: "Disney Plus" }],
    cast: [
      { name: "Shameik Moore", character: "Miles Morales" },
      { name: "Hailee Steinfeld", character: "Gwen Stacy" },
    ],
    seasons: [],
  },
  {
    tmdbId: 101,
    mediaType: "tv",
    title: "Andor",
    overview:
      "Cassian Andor is drawn into the growing rebellion in a tense slow-burn story of resistance.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2022-09-21",
    runtimeMinutes: 47,
    genres: ["Science Fiction", "Drama", "Action"],
    voteAverage: 8.5,
    popularity: 75,
    providers: [{ name: "Disney Plus" }],
    cast: [
      { name: "Diego Luna", character: "Cassian Andor" },
      { name: "Stellan Skarsgard", character: "Luthen Rael" },
    ],
    seasons: [{ seasonNumber: 1, name: "Season 1", episodeCount: 12 }],
  },
  {
    tmdbId: 102,
    mediaType: "tv",
    title: "The Bear",
    overview:
      "A brilliant young chef returns home to run his family's chaotic sandwich shop.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2022-06-23",
    runtimeMinutes: 34,
    genres: ["Comedy", "Drama"],
    voteAverage: 8.2,
    popularity: 70,
    providers: [{ name: "Hulu" }],
    cast: [
      { name: "Jeremy Allen White", character: "Carmy" },
      { name: "Ayo Edebiri", character: "Sydney" },
    ],
    seasons: [
      { seasonNumber: 1, name: "Season 1", episodeCount: 8 },
      { seasonNumber: 2, name: "Season 2", episodeCount: 10 },
    ],
  },
  {
    tmdbId: 103,
    mediaType: "tv",
    title: "Severance",
    overview:
      "Office workers divide their memories between work and life in a deeply unsettling corporate mystery.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2022-02-18",
    runtimeMinutes: 50,
    genres: ["Drama", "Mystery", "Science Fiction"],
    voteAverage: 8.4,
    popularity: 83,
    providers: [{ name: "Apple TV Plus" }],
    cast: [
      { name: "Adam Scott", character: "Mark Scout" },
      { name: "Britt Lower", character: "Helly R." },
    ],
    seasons: [{ seasonNumber: 1, name: "Season 1", episodeCount: 9 }],
  },
  {
    tmdbId: 104,
    mediaType: "tv",
    title: "Only Murders in the Building",
    overview:
      "Three neighbors turn their true-crime obsession into an amateur investigation inside their apartment building.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2021-08-31",
    runtimeMinutes: 33,
    genres: ["Comedy", "Mystery", "Crime"],
    voteAverage: 8,
    popularity: 67,
    providers: [{ name: "Hulu" }, { name: "Disney Plus" }],
    cast: [
      { name: "Steve Martin", character: "Charles-Haden Savage" },
      { name: "Selena Gomez", character: "Mabel Mora" },
    ],
    seasons: [
      { seasonNumber: 1, name: "Season 1", episodeCount: 10 },
      { seasonNumber: 2, name: "Season 2", episodeCount: 10 },
    ],
  },
  {
    tmdbId: 105,
    mediaType: "tv",
    title: "Blue Eye Samurai",
    overview:
      "A swordmaster travels Edo-period Japan on a stylish and deeply personal revenge mission.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2023-11-03",
    runtimeMinutes: 44,
    genres: ["Animation", "Action", "Drama"],
    voteAverage: 8.7,
    popularity: 74,
    providers: [{ name: "Netflix" }],
    cast: [
      { name: "Maya Erskine", character: "Mizu" },
      { name: "Kenneth Branagh", character: "Abijah Fowler" },
    ],
    seasons: [{ seasonNumber: 1, name: "Season 1", episodeCount: 8 }],
  },
  {
    tmdbId: 106,
    mediaType: "tv",
    title: "Abbott Elementary",
    overview:
      "A group of dedicated teachers tries to keep an underfunded public school joyful and alive.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2021-12-07",
    runtimeMinutes: 22,
    genres: ["Comedy"],
    voteAverage: 8.1,
    popularity: 58,
    providers: [{ name: "Hulu" }, { name: "Max" }],
    cast: [
      { name: "Quinta Brunson", character: "Janine Teagues" },
      { name: "Sheryl Lee Ralph", character: "Barbara Howard" },
    ],
    seasons: [
      { seasonNumber: 1, name: "Season 1", episodeCount: 13 },
      { seasonNumber: 2, name: "Season 2", episodeCount: 22 },
    ],
  },
  {
    tmdbId: 107,
    mediaType: "tv",
    title: "Ted Lasso",
    overview:
      "An American football coach unexpectedly takes charge of an English soccer club and wins people over with optimism.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2020-08-14",
    runtimeMinutes: 31,
    genres: ["Comedy", "Drama"],
    voteAverage: 8.4,
    popularity: 71,
    providers: [{ name: "Apple TV Plus" }],
    cast: [
      { name: "Jason Sudeikis", character: "Ted Lasso" },
      { name: "Hannah Waddingham", character: "Rebecca Welton" },
    ],
    seasons: [
      { seasonNumber: 1, name: "Season 1", episodeCount: 10 },
      { seasonNumber: 2, name: "Season 2", episodeCount: 12 },
      { seasonNumber: 3, name: "Season 3", episodeCount: 12 },
    ],
  },
  {
    tmdbId: 108,
    mediaType: "tv",
    title: "Slow Horses",
    overview:
      "A mismatched team of intelligence outcasts keeps stumbling into national-security disasters.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2022-04-01",
    runtimeMinutes: 45,
    genres: ["Thriller", "Drama", "Comedy"],
    voteAverage: 8.2,
    popularity: 66,
    providers: [{ name: "Apple TV Plus" }],
    cast: [
      { name: "Gary Oldman", character: "Jackson Lamb" },
      { name: "Jack Lowden", character: "River Cartwright" },
    ],
    seasons: [
      { seasonNumber: 1, name: "Season 1", episodeCount: 6 },
      { seasonNumber: 2, name: "Season 2", episodeCount: 6 },
    ],
  },
];

export const MOCK_GENRES = dedupeByKey(
  MOCK_TITLES.flatMap((title) => title.genres).map((genre) => ({ name: genre })),
  (item) => item.name,
)
  .map((item) => item.name)
  .sort();

function paginate<T>(items: T[], page = 1, pageSize = 12): PagedResult<T> {
  const start = (page - 1) * pageSize;
  const results = items.slice(start, start + pageSize);

  return {
    page,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    totalResults: items.length,
    results,
  };
}

export function getMockTitleDetails(
  tmdbId: number,
  mediaType: MediaTypeKey,
): TitleDetails | null {
  return (
    MOCK_TITLES.find(
      (title) => title.tmdbId === tmdbId && title.mediaType === mediaType,
    ) ?? null
  );
}

export function searchMockTitles(
  query: string,
  page = 1,
  mediaType: "all" | MediaTypeKey = "all",
): PagedResult<TitleSummary> {
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = MOCK_TITLES.filter((title) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      title.title.toLowerCase().includes(normalizedQuery) ||
      title.overview.toLowerCase().includes(normalizedQuery);
    const matchesType = mediaType === "all" || title.mediaType === mediaType;

    return matchesQuery && matchesType;
  });

  return paginate(filtered, page);
}

export function discoverMockTitles(
  input: DiscoverTitlesInput,
): PagedResult<TitleSummary> {
  const filtered = MOCK_TITLES.filter((title) => {
    if (input.mediaType && title.mediaType !== input.mediaType) {
      return false;
    }

    if (input.genre && !title.genres.includes(input.genre)) {
      return false;
    }

    if (
      input.year &&
      new Date(title.releaseDate ?? "").getUTCFullYear() !== input.year
    ) {
      return false;
    }

    if (input.runtimeMax && (title.runtimeMinutes ?? 0) > input.runtimeMax) {
      return false;
    }

    if (
      input.provider &&
      !title.providers.some((provider) => provider.name === input.provider)
    ) {
      return false;
    }

    return true;
  }).sort((left, right) => {
    if (input.sortBy === "vote_average.desc") {
      return (right.voteAverage ?? 0) - (left.voteAverage ?? 0);
    }

    if (input.sortBy === "newest.desc") {
      return (
        new Date(right.releaseDate ?? "1970-01-01").getTime() -
        new Date(left.releaseDate ?? "1970-01-01").getTime()
      );
    }

    return (right.popularity ?? 0) - (left.popularity ?? 0);
  });

  return paginate(filtered, input.page);
}

export function getMockRecommendationCandidates(
  mediaTypes: MediaTypeKey[],
  genres: string[],
  providers: string[],
): TitleSummary[] {
  const genreSet = new Set(genres);
  const providerSet = new Set(providers);

  const candidates = MOCK_TITLES.filter((title) => {
    const matchesType = mediaTypes.includes(title.mediaType);
    const matchesGenre =
      genreSet.size === 0 || title.genres.some((genre) => genreSet.has(genre));
    const matchesProvider =
      providerSet.size === 0 ||
      title.providers.some((provider) => providerSet.has(provider.name));

    return matchesType && (matchesGenre || matchesProvider);
  }).sort((left, right) => (right.popularity ?? 0) - (left.popularity ?? 0));

  return candidates;
}
