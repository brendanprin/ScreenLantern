-- CreateEnum
CREATE TYPE "ReminderCategory" AS ENUM ('AVAILABLE_NOW', 'WATCHLIST_RESURFACE', 'GROUP_WATCH_CANDIDATE');

-- CreateTable
CREATE TABLE "UserReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "titleCacheId" TEXT NOT NULL,
    "mode" "RecommendationMode" NOT NULL,
    "category" "ReminderCategory" NOT NULL,
    "contextKey" TEXT NOT NULL,
    "contextLabel" TEXT NOT NULL,
    "selectedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "savedGroupId" TEXT,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "explanationJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserReminder_userId_contextKey_category_titleCacheId_key" ON "UserReminder"("userId", "contextKey", "category", "titleCacheId");

-- CreateIndex
CREATE INDEX "UserReminder_userId_contextKey_isActive_readAt_idx" ON "UserReminder"("userId", "contextKey", "isActive", "readAt");

-- CreateIndex
CREATE INDEX "UserReminder_householdId_updatedAt_idx" ON "UserReminder"("householdId", "updatedAt");

-- AddForeignKey
ALTER TABLE "UserReminder" ADD CONSTRAINT "UserReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReminder" ADD CONSTRAINT "UserReminder_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReminder" ADD CONSTRAINT "UserReminder_titleCacheId_fkey" FOREIGN KEY ("titleCacheId") REFERENCES "TitleCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReminder" ADD CONSTRAINT "UserReminder_savedGroupId_fkey" FOREIGN KEY ("savedGroupId") REFERENCES "HouseholdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
