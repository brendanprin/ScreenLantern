-- CreateEnum
CREATE TYPE "ReminderAggressiveness" AS ENUM ('LIGHT', 'BALANCED', 'PROACTIVE');

-- CreateTable
CREATE TABLE "UserReminderPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "enableAvailableNow" BOOLEAN NOT NULL DEFAULT true,
    "enableWatchlistResurface" BOOLEAN NOT NULL DEFAULT true,
    "enableGroupWatchCandidate" BOOLEAN NOT NULL DEFAULT true,
    "enableSoloReminders" BOOLEAN NOT NULL DEFAULT true,
    "enableGroupReminders" BOOLEAN NOT NULL DEFAULT true,
    "aggressiveness" "ReminderAggressiveness" NOT NULL DEFAULT 'BALANCED',
    "allowDismissedReappear" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReminderPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserReminderPreference_userId_key" ON "UserReminderPreference"("userId");

-- CreateIndex
CREATE INDEX "UserReminderPreference_householdId_updatedAt_idx" ON "UserReminderPreference"("householdId", "updatedAt");

-- AddForeignKey
ALTER TABLE "UserReminderPreference" ADD CONSTRAINT "UserReminderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReminderPreference" ADD CONSTRAINT "UserReminderPreference_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
