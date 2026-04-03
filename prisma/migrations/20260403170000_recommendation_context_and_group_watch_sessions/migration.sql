-- CreateTable
CREATE TABLE "UserRecommendationContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "mode" "RecommendationMode" NOT NULL DEFAULT 'SOLO',
    "selectedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "savedGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRecommendationContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupWatchSession" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "titleCacheId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "savedGroupId" TEXT,
    "participantKey" TEXT NOT NULL,
    "participantUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupWatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserRecommendationContext_userId_key" ON "UserRecommendationContext"("userId");

-- CreateIndex
CREATE INDEX "UserRecommendationContext_householdId_updatedAt_idx" ON "UserRecommendationContext"("householdId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupWatchSession_householdId_titleCacheId_participantKey_key" ON "GroupWatchSession"("householdId", "titleCacheId", "participantKey");

-- CreateIndex
CREATE INDEX "GroupWatchSession_householdId_watchedAt_idx" ON "GroupWatchSession"("householdId", "watchedAt");

-- AddForeignKey
ALTER TABLE "UserRecommendationContext" ADD CONSTRAINT "UserRecommendationContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRecommendationContext" ADD CONSTRAINT "UserRecommendationContext_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRecommendationContext" ADD CONSTRAINT "UserRecommendationContext_savedGroupId_fkey" FOREIGN KEY ("savedGroupId") REFERENCES "HouseholdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupWatchSession" ADD CONSTRAINT "GroupWatchSession_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupWatchSession" ADD CONSTRAINT "GroupWatchSession_titleCacheId_fkey" FOREIGN KEY ("titleCacheId") REFERENCES "TitleCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupWatchSession" ADD CONSTRAINT "GroupWatchSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupWatchSession" ADD CONSTRAINT "GroupWatchSession_savedGroupId_fkey" FOREIGN KEY ("savedGroupId") REFERENCES "HouseholdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
