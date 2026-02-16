-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'AI_SUMMARY';
ALTER TYPE "ActionType" ADD VALUE 'AI_RISK_ASSESSMENT';
ALTER TYPE "ActionType" ADD VALUE 'AI_LABEL_SUGGEST';
ALTER TYPE "ActionType" ADD VALUE 'AI_REVIEWER_SUGGEST';
ALTER TYPE "ActionType" ADD VALUE 'AI_DIGEST';
ALTER TYPE "ActionType" ADD VALUE 'AI_DEPENDENCY_DETECTION';

-- AlterTable
ALTER TABLE "PullRequestAttention" ADD COLUMN     "riskFactors" JSONB,
ADD COLUMN     "riskLevel" TEXT;

-- CreateTable
CREATE TABLE "AiCache" (
    "id" TEXT NOT NULL,
    "pullRequestId" TEXT,
    "repository" TEXT,
    "featureType" TEXT NOT NULL,
    "resultJson" JSONB,
    "resultText" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCache_featureType_expiresAt_idx" ON "AiCache"("featureType", "expiresAt");

-- CreateIndex
CREATE INDEX "AiCache_repository_featureType_idx" ON "AiCache"("repository", "featureType");

-- CreateIndex
CREATE UNIQUE INDEX "AiCache_pullRequestId_featureType_key" ON "AiCache"("pullRequestId", "featureType");
