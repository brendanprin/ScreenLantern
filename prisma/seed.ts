process.loadEnvFile?.(".env");

import { hash } from "bcryptjs";
import {
  HouseholdRole,
  InteractionType,
  MediaType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { getMockTitleDetails } from "../src/lib/mock-tmdb";

const prisma = new PrismaClient();

const DEMO_USERS = [
  {
    name: "Brendan",
    email: "brendan@screenlantern.demo",
    householdRole: HouseholdRole.OWNER,
    preferredProviders: ["Max", "Apple TV Plus"],
    watchlist: [
      ["movie", 16],
      ["tv", 108],
    ],
    likes: [
      ["movie", 11],
      ["movie", 12],
      ["tv", 101],
      ["tv", 103],
    ],
    watched: [
      ["movie", 17],
      ["movie", 14],
    ],
    dislikes: [["tv", 106]],
  },
  {
    name: "Katie",
    email: "katie@screenlantern.demo",
    householdRole: HouseholdRole.MEMBER,
    preferredProviders: ["Hulu", "Prime Video"],
    watchlist: [
      ["movie", 12],
      ["movie", 17],
    ],
    likes: [
      ["movie", 13],
      ["movie", 14],
      ["tv", 102],
      ["tv", 107],
    ],
    watched: [["movie", 15]],
    dislikes: [["movie", 16]],
  },
  {
    name: "Palmer",
    email: "palmer@screenlantern.demo",
    householdRole: HouseholdRole.MEMBER,
    preferredProviders: ["Netflix", "Disney Plus"],
    watchlist: [
      ["movie", 18],
      ["tv", 104],
    ],
    likes: [
      ["movie", 18],
      ["movie", 16],
      ["tv", 101],
      ["tv", 105],
    ],
    watched: [["movie", 13]],
    dislikes: [["movie", 17]],
  },
  {
    name: "Geoff",
    email: "geoff@screenlantern.demo",
    householdRole: HouseholdRole.MEMBER,
    preferredProviders: ["Apple TV Plus", "Hulu"],
    watchlist: [
      ["tv", 107],
      ["movie", 15],
    ],
    likes: [
      ["movie", 14],
      ["movie", 13],
      ["tv", 108],
      ["tv", 106],
    ],
    watched: [["tv", 104]],
    dislikes: [["movie", 11]],
  },
] as const;

async function upsertMockTitle(mediaType: "movie" | "tv", tmdbId: number) {
  const title = getMockTitleDetails(tmdbId, mediaType);

  if (!title) {
    throw new Error(`Missing mock title for ${mediaType}:${tmdbId}`);
  }

  const providerSnapshot =
    title.providers as unknown as Prisma.InputJsonValue;
  const metadataJson = title as unknown as Prisma.InputJsonValue;

  return prisma.titleCache.upsert({
    where: {
      tmdbId_mediaType: {
        tmdbId: title.tmdbId,
        mediaType: mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      },
    },
    update: {
      title: title.title,
      overview: title.overview,
      posterPath: title.posterPath,
      backdropPath: title.backdropPath,
      releaseDate: title.releaseDate ? new Date(title.releaseDate) : null,
      runtimeMinutes: title.runtimeMinutes ?? null,
      genres: title.genres,
      voteAverage: title.voteAverage ?? null,
      popularity: title.popularity ?? null,
      providerSnapshot,
      metadataJson,
      lastSyncedAt: new Date(),
    },
    create: {
      tmdbId: title.tmdbId,
      mediaType: mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      title: title.title,
      overview: title.overview,
      posterPath: title.posterPath,
      backdropPath: title.backdropPath,
      releaseDate: title.releaseDate ? new Date(title.releaseDate) : null,
      runtimeMinutes: title.runtimeMinutes ?? null,
      genres: title.genres,
      voteAverage: title.voteAverage ?? null,
      popularity: title.popularity ?? null,
      providerSnapshot,
      metadataJson,
    },
  });
}

async function applyInteraction(args: {
  userId: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  interactionType: InteractionType;
}) {
  const cachedTitle = await upsertMockTitle(args.mediaType, args.tmdbId);

  await prisma.userTitleInteraction.upsert({
    where: {
      userId_titleCacheId_interactionType: {
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: args.interactionType,
      },
    },
    update: {},
    create: {
      userId: args.userId,
      titleCacheId: cachedTitle.id,
      interactionType: args.interactionType,
    },
  });
}

async function main() {
  const passwordHash = await hash("screenlantern-demo", 12);

  const household = await prisma.household.upsert({
    where: {
      id: "screenlantern-demo-household",
    },
    update: {
      name: "Lantern House",
    },
    create: {
      id: "screenlantern-demo-household",
      name: "Lantern House",
    },
  });

  const createdUsers = await Promise.all(
    DEMO_USERS.map(async (user) =>
      prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          passwordHash,
          householdId: household.id,
          householdRole: user.householdRole,
          preferredProviders: [...user.preferredProviders],
        },
        create: {
          email: user.email,
          name: user.name,
          passwordHash,
          householdId: household.id,
          householdRole: user.householdRole,
          preferredProviders: [...user.preferredProviders],
        },
      }),
    ),
  );

  const userIdByName = new Map(createdUsers.map((user) => [user.name, user.id]));

  await prisma.householdGroup.deleteMany({
    where: { householdId: household.id },
  });

  await prisma.householdInvite.deleteMany({
    where: { householdId: household.id },
  });

  await prisma.userRecommendationContext.deleteMany({
    where: { householdId: household.id },
  });

  await prisma.groupWatchSession.deleteMany({
    where: { householdId: household.id },
  });

  await prisma.recommendationRun.deleteMany({
    where: { householdId: household.id },
  });

  await prisma.householdGroup.create({
    data: {
      householdId: household.id,
      createdById: userIdByName.get("Brendan")!,
      name: "Brendan + Katie",
      members: {
        createMany: {
          data: [
            { userId: userIdByName.get("Brendan")! },
            { userId: userIdByName.get("Katie")! },
          ],
        },
      },
    },
  });

  await prisma.householdInvite.create({
    data: {
      householdId: household.id,
      createdById: userIdByName.get("Brendan")!,
      code: "LANTERNJOIN",
      role: HouseholdRole.MEMBER,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });

  await prisma.householdGroup.create({
    data: {
      householdId: household.id,
      createdById: userIdByName.get("Brendan")!,
      name: "Brendan + Palmer",
      members: {
        createMany: {
          data: [
            { userId: userIdByName.get("Brendan")! },
            { userId: userIdByName.get("Palmer")! },
          ],
        },
      },
    },
  });

  await prisma.householdGroup.create({
    data: {
      householdId: household.id,
      createdById: userIdByName.get("Brendan")!,
      name: "Brendan + Palmer + Geoff",
      members: {
        createMany: {
          data: [
            { userId: userIdByName.get("Brendan")! },
            { userId: userIdByName.get("Palmer")! },
            { userId: userIdByName.get("Geoff")! },
          ],
        },
      },
    },
  });

  await prisma.userTitleInteraction.deleteMany({
    where: {
      user: {
        householdId: household.id,
      },
    },
  });

  for (const user of DEMO_USERS) {
    const userId = userIdByName.get(user.name)!;

    for (const [mediaType, tmdbId] of user.watchlist) {
      await applyInteraction({
        userId,
        mediaType,
        tmdbId,
        interactionType: InteractionType.WATCHLIST,
      });
    }

    for (const [mediaType, tmdbId] of user.likes) {
      await applyInteraction({
        userId,
        mediaType,
        tmdbId,
        interactionType: InteractionType.LIKE,
      });
    }

    for (const [mediaType, tmdbId] of user.watched) {
      await applyInteraction({
        userId,
        mediaType,
        tmdbId,
        interactionType: InteractionType.WATCHED,
      });
    }

    for (const [mediaType, tmdbId] of user.dislikes) {
      await applyInteraction({
        userId,
        mediaType,
        tmdbId,
        interactionType: InteractionType.DISLIKE,
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
