CREATE TYPE "TraktSyncMode" AS ENUM ('OFF', 'DAILY', 'ON_LOGIN_OR_APP_OPEN');

ALTER TABLE "UserTraktConnection"
ADD COLUMN "syncMode" "TraktSyncMode" NOT NULL DEFAULT 'DAILY',
ADD COLUMN "lastSyncAttemptedAt" TIMESTAMP(3);

CREATE INDEX "UserTraktConnection_householdId_syncMode_lastSyncAttemptedAt_idx"
ON "UserTraktConnection"("householdId", "syncMode", "lastSyncAttemptedAt");
