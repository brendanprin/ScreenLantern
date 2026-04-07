-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('NETFLIX');

-- CreateEnum
CREATE TYPE "UnresolvedImportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "UnresolvedImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "status" "UnresolvedImportStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedTitleCacheId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnresolvedImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnresolvedImport_userId_source_rawTitle_key" ON "UnresolvedImport"("userId", "source", "rawTitle");

-- CreateIndex
CREATE INDEX "UnresolvedImport_userId_source_status_idx" ON "UnresolvedImport"("userId", "source", "status");

-- AddForeignKey
ALTER TABLE "UnresolvedImport" ADD CONSTRAINT "UnresolvedImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnresolvedImport" ADD CONSTRAINT "UnresolvedImport_resolvedTitleCacheId_fkey" FOREIGN KEY ("resolvedTitleCacheId") REFERENCES "TitleCache"("id") ON DELETE SET NULL ON UPDATE CASCADE;
