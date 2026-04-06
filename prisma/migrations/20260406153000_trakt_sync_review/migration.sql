CREATE TYPE "TraktSyncTrigger" AS ENUM ('MANUAL', 'AUTOMATIC');

ALTER TABLE "UserTraktConnection"
ADD COLUMN "lastSyncTrigger" "TraktSyncTrigger",
ADD COLUMN "lastSyncSummaryJson" JSONB;
