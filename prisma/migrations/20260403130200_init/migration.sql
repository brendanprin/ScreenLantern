-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('WATCHLIST', 'WATCHED', 'LIKE', 'DISLIKE', 'HIDE');

-- CreateEnum
CREATE TYPE "SourceContext" AS ENUM ('SOLO', 'GROUP', 'MANUAL');

-- CreateEnum
CREATE TYPE "RecommendationMode" AS ENUM ('SOLO', 'GROUP');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('MOVIE', 'TV');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "preferredProviders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultMediaType" "MediaType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdGroup" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "HouseholdGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "TitleCache" (
    "id" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "title" TEXT NOT NULL,
    "overview" TEXT NOT NULL,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "releaseDate" TIMESTAMP(3),
    "runtimeMinutes" INTEGER,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "voteAverage" DOUBLE PRECISION,
    "popularity" DOUBLE PRECISION,
    "providerSnapshot" JSONB,
    "metadataJson" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TitleCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTitleInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titleCacheId" TEXT NOT NULL,
    "interactionType" "InteractionType" NOT NULL,
    "sourceContext" "SourceContext" NOT NULL DEFAULT 'MANUAL',
    "groupRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTitleInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationRun" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "mode" "RecommendationMode" NOT NULL,
    "requestedById" TEXT NOT NULL,
    "selectedUserIds" TEXT[],
    "filtersJson" JSONB,
    "resultTitleIds" TEXT[],
    "explanationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdGroup_householdId_name_key" ON "HouseholdGroup"("householdId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TitleCache_tmdbId_mediaType_key" ON "TitleCache"("tmdbId", "mediaType");

-- CreateIndex
CREATE INDEX "UserTitleInteraction_userId_interactionType_idx" ON "UserTitleInteraction"("userId", "interactionType");

-- CreateIndex
CREATE UNIQUE INDEX "UserTitleInteraction_userId_titleCacheId_interactionType_key" ON "UserTitleInteraction"("userId", "titleCacheId", "interactionType");

-- CreateIndex
CREATE INDEX "RecommendationRun_householdId_mode_createdAt_idx" ON "RecommendationRun"("householdId", "mode", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdGroup" ADD CONSTRAINT "HouseholdGroup_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdGroup" ADD CONSTRAINT "HouseholdGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdGroupMember" ADD CONSTRAINT "HouseholdGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "HouseholdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdGroupMember" ADD CONSTRAINT "HouseholdGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTitleInteraction" ADD CONSTRAINT "UserTitleInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTitleInteraction" ADD CONSTRAINT "UserTitleInteraction_titleCacheId_fkey" FOREIGN KEY ("titleCacheId") REFERENCES "TitleCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
