-- CreateEnum
CREATE TYPE "SharedWatchlistScope" AS ENUM ('GROUP', 'HOUSEHOLD');

-- CreateTable
CREATE TABLE "SharedWatchlistEntry" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "titleCacheId" TEXT NOT NULL,
    "scope" "SharedWatchlistScope" NOT NULL,
    "contextKey" TEXT NOT NULL,
    "contextLabel" TEXT NOT NULL,
    "selectedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "savedGroupId" TEXT,
    "savedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedWatchlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedWatchlistEntry_savedById_contextKey_titleCacheId_key" ON "SharedWatchlistEntry"("savedById", "contextKey", "titleCacheId");

-- CreateIndex
CREATE INDEX "SharedWatchlistEntry_householdId_contextKey_titleCacheId_idx" ON "SharedWatchlistEntry"("householdId", "contextKey", "titleCacheId");

-- CreateIndex
CREATE INDEX "SharedWatchlistEntry_householdId_scope_updatedAt_idx" ON "SharedWatchlistEntry"("householdId", "scope", "updatedAt");

-- AddForeignKey
ALTER TABLE "SharedWatchlistEntry" ADD CONSTRAINT "SharedWatchlistEntry_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedWatchlistEntry" ADD CONSTRAINT "SharedWatchlistEntry_titleCacheId_fkey" FOREIGN KEY ("titleCacheId") REFERENCES "TitleCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedWatchlistEntry" ADD CONSTRAINT "SharedWatchlistEntry_savedGroupId_fkey" FOREIGN KEY ("savedGroupId") REFERENCES "HouseholdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedWatchlistEntry" ADD CONSTRAINT "SharedWatchlistEntry_savedById_fkey" FOREIGN KEY ("savedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
