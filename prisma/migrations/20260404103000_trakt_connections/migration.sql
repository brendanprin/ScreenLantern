ALTER TYPE "SourceContext" ADD VALUE IF NOT EXISTS 'IMPORTED';

CREATE TYPE "TraktSyncStatus" AS ENUM ('SUCCESS', 'ERROR', 'NEEDS_REAUTH');

CREATE TABLE "UserTraktConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "traktUserId" TEXT,
    "traktUsername" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "lastActivitiesJson" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" "TraktSyncStatus",
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTraktConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTraktConnection_userId_key" ON "UserTraktConnection"("userId");
CREATE INDEX "UserTraktConnection_householdId_updatedAt_idx" ON "UserTraktConnection"("householdId", "updatedAt");

ALTER TABLE "UserTraktConnection"
ADD CONSTRAINT "UserTraktConnection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTraktConnection"
ADD CONSTRAINT "UserTraktConnection_householdId_fkey"
FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
