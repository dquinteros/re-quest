-- AlterTable
ALTER TABLE "PullRequest" ADD COLUMN     "additions" INTEGER,
ADD COLUMN     "changedFiles" INTEGER,
ADD COLUMN     "commentCount" INTEGER,
ADD COLUMN     "commitCount" INTEGER,
ADD COLUMN     "deletions" INTEGER;
