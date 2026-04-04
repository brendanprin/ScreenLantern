-- CreateEnum
CREATE TYPE "HouseholdActivityType" AS ENUM (
  'SHARED_SAVE_ADDED',
  'SHARED_SAVE_REMOVED',
  'GROUP_WATCH_RECORDED',
  'INVITE_CREATED',
  'INVITE_REVOKED',
  'INVITE_REDEEMED',
  'OWNERSHIP_TRANSFERRED',
  'MEMBER_REMOVED'
);

-- CreateTable
CREATE TABLE "HouseholdActivity" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "titleCacheId" TEXT,
  "type" "HouseholdActivityType" NOT NULL,
  "contextLabel" TEXT,
  "summary" TEXT NOT NULL,
  "detail" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HouseholdActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseholdActivity_householdId_createdAt_idx"
ON "HouseholdActivity"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "HouseholdActivity_householdId_type_createdAt_idx"
ON "HouseholdActivity"("householdId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "HouseholdActivity"
ADD CONSTRAINT "HouseholdActivity_householdId_fkey"
FOREIGN KEY ("householdId") REFERENCES "Household"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdActivity"
ADD CONSTRAINT "HouseholdActivity_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdActivity"
ADD CONSTRAINT "HouseholdActivity_titleCacheId_fkey"
FOREIGN KEY ("titleCacheId") REFERENCES "TitleCache"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
