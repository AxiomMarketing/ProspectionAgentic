-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "nurture_interactions_prospectId_idx" ON "nurture_interactions"("prospectId");

-- CreateIndex
CREATE INDEX "nurture_interactions_nurtureId_idx" ON "nurture_interactions"("nurtureId");

-- CreateIndex
CREATE INDEX "reply_classifications_prospectId_idx" ON "reply_classifications"("prospectId");
