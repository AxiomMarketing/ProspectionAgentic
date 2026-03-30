-- AlterTable
ALTER TABLE "nurture_interactions" ADD COLUMN     "details" JSONB,
ADD COLUMN     "scoreAfter" DOUBLE PRECISION,
ADD COLUMN     "scoreDelta" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "nurture_prospects" ADD COLUMN     "consecutiveUnopened" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consentBasis" TEXT NOT NULL DEFAULT 'legitimate_interest',
ADD COLUMN     "contentDownloaded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dataRetentionUntil" TIMESTAMP(3),
ADD COLUMN     "emailsClicked" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailsNurtureSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailsOpened" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "engagementScoreCurrent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "engagementScoreInitial" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "inactiveSince" TIMESTAMP(3),
ADD COLUMN     "journeyStage" TEXT NOT NULL DEFAULT 'awareness',
ADD COLUMN     "lastEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "lastInteractionAt" TIMESTAMP(3),
ADD COLUMN     "lastScoreUpdate" TIMESTAMP(3),
ADD COLUMN     "nextEmailScheduledAt" TIMESTAMP(3),
ADD COLUMN     "nextRescoreAt" TIMESTAMP(3),
ADD COLUMN     "optOutAt" TIMESTAMP(3),
ADD COLUMN     "repliesReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scoringCategorie" TEXT,
ADD COLUMN     "segment" TEXT,
ADD COLUMN     "sequenceType" TEXT,
ADD COLUMN     "totalSteps" INTEGER NOT NULL DEFAULT 12;
