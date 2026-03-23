-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('raw', 'enriched', 'scored', 'contacted', 'replied', 'meeting_booked', 'deal_in_progress', 'won', 'lost', 'nurturing', 'blacklisted', 'unsubscribed');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('email', 'linkedin', 'phone', 'sms', 'postal');

-- CreateEnum
CREATE TYPE "SequenceStepStatus" AS ENUM ('pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ReplySentiment" AS ENUM ('positive', 'negative', 'neutral', 'out_of_office', 'unsubscribe_request');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('open', 'closed', 'awarded', 'cancelled');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('discovery', 'proposal', 'negotiation', 'closed_won', 'closed_lost');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('connection_request', 'message', 'inmail', 'visit', 'endorse');

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "linkedinId" TEXT,
    "companyName" TEXT,
    "companySiren" TEXT,
    "companySize" TEXT,
    "companyRevenue" DOUBLE PRECISION,
    "companyWebsite" TEXT,
    "companyTechStack" JSONB,
    "jobTitle" TEXT,
    "seniorityLevel" TEXT,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProspectStatus" NOT NULL DEFAULT 'raw',
    "enrichmentData" JSONB,
    "enrichedAt" TIMESTAMP(3),
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentDate" TIMESTAMP(3),
    "rgpdErasedAt" TIMESTAMP(3),

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_leads" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rawData" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "prospectId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "raw_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_scores" (
    "id" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prospectId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "firmographicScore" DOUBLE PRECISION NOT NULL,
    "technographicScore" DOUBLE PRECISION NOT NULL,
    "behavioralScore" DOUBLE PRECISION NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL,
    "intentScore" DOUBLE PRECISION NOT NULL,
    "accessibilityScore" DOUBLE PRECISION NOT NULL,
    "scoreBreakdown" JSONB,
    "segment" TEXT,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "modelVersion" TEXT NOT NULL DEFAULT '1.0',

    CONSTRAINT "prospect_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_coefficients" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "coefficients" JSONB NOT NULL,

    CONSTRAINT "scoring_coefficients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT[],
    "variant" TEXT,
    "abGroupId" TEXT,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalOpened" INTEGER NOT NULL DEFAULT 0,
    "totalClicked" INTEGER NOT NULL DEFAULT 0,
    "totalReplied" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "promptVersion" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_messages" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prospectId" TEXT NOT NULL,
    "templateId" TEXT,
    "channel" "ChannelType" NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "costEur" DOUBLE PRECISION NOT NULL,
    "generationMs" INTEGER NOT NULL,
    "personalizationData" JSONB,
    "langfuseTraceId" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "generated_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sends" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prospectId" TEXT NOT NULL,
    "messageId" TEXT,
    "sequenceId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "SequenceStepStatus" NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "bounceType" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "trackingPixelId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linkedin_actions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prospectId" TEXT NOT NULL,
    "sequenceId" TEXT,
    "actionType" "ActionType" NOT NULL,
    "messageBody" TEXT,
    "status" "SequenceStepStatus" NOT NULL DEFAULT 'pending',
    "executedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerActionId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "linkedin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_classifications" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prospectId" TEXT NOT NULL,
    "generatedMessageId" TEXT,
    "emailSendId" TEXT,
    "linkedinActionId" TEXT,
    "rawReply" TEXT NOT NULL,
    "replyReceivedAt" TIMESTAMP(3) NOT NULL,
    "sentiment" "ReplySentiment" NOT NULL,
    "intent" TEXT,
    "nextBestAction" TEXT,
    "suggestedResponse" TEXT,
    "classificationConfidence" DOUBLE PRECISION,
    "modelUsed" TEXT,
    "costEur" DOUBLE PRECISION,
    "langfuseTraceId" TEXT,
    "actionTaken" TEXT,
    "actionTakenAt" TIMESTAMP(3),
    "actionTakenBy" TEXT,

    CONSTRAINT "reply_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_sequences" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prospectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "totalSteps" INTEGER NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "nextStepAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "stoppedReason" TEXT,
    "opensCount" INTEGER NOT NULL DEFAULT 0,
    "clicksCount" INTEGER NOT NULL DEFAULT 0,
    "repliesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "prospect_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bounce_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "prospectId" TEXT,
    "emailSendId" TEXT,
    "bounceType" TEXT NOT NULL,
    "bounceCode" TEXT,
    "bounceMessage" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT,

    CONSTRAINT "bounce_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nurture_prospects" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prospectId" TEXT NOT NULL,
    "entryReason" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reactivationDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "reactivatedAt" TIMESTAMP(3),
    "exitReason" TEXT,
    "notes" TEXT,
    "tags" TEXT[],

    CONSTRAINT "nurture_prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nurture_interactions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nurtureId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "contentTitle" TEXT,
    "contentUrl" TEXT,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "replied" BOOLEAN NOT NULL DEFAULT false,
    "replySentiment" "ReplySentiment",

    CONSTRAINT "nurture_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals_crm" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prospectId" TEXT NOT NULL,
    "customerId" TEXT,
    "title" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'discovery',
    "amountEur" DOUBLE PRECISION,
    "probability" DOUBLE PRECISION,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "wonReason" TEXT,
    "lostReason" TEXT,
    "ownerEmail" TEXT,
    "quoteId" TEXT,
    "tenderId" TEXT,
    "stageHistory" JSONB,

    CONSTRAINT "deals_crm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dealId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountHtEur" DOUBLE PRECISION NOT NULL,
    "tvaRate" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "amountTtcEur" DOUBLE PRECISION,
    "lineItems" JSONB NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "yousignProcedureId" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_tenders" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "buyerName" TEXT,
    "buyerSiren" TEXT,
    "publicationDate" TIMESTAMP(3),
    "deadlineDate" TIMESTAMP(3),
    "estimatedAmount" DOUBLE PRECISION,
    "estimatedBudget" DOUBLE PRECISION,
    "dceFitScore" DOUBLE PRECISION,
    "dceAnalyzed" BOOLEAN NOT NULL DEFAULT false,
    "dceAnalysisResult" JSONB,
    "langfuseTraceId" TEXT,
    "status" "TenderStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "public_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyName" TEXT NOT NULL,
    "siren" TEXT,
    "legalForm" TEXT,
    "primaryContactId" TEXT,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "mrrEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "churnedAt" TIMESTAMP(3),
    "churnReason" TEXT,
    "externalCrmId" TEXT,
    "notes" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_health_scores" (
    "id" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT NOT NULL,
    "healthScore" DOUBLE PRECISION NOT NULL,
    "healthLabel" TEXT,
    "usageScore" DOUBLE PRECISION,
    "supportScore" DOUBLE PRECISION,
    "financialScore" DOUBLE PRECISION,
    "engagementScore" DOUBLE PRECISION,
    "npsScore" DOUBLE PRECISION,
    "signals" JSONB,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_health_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metriques_daily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "dimensions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metriques_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertes" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "metricName" TEXT,
    "metricValue" DOUBLE PRECISION,
    "thresholdValue" DOUBLE PRECISION,
    "notifiedSlack" BOOLEAN NOT NULL DEFAULT false,
    "notifiedEmail" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "alertes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommandations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "actionUrl" TEXT,
    "targetType" TEXT,
    "targetIds" TEXT[],
    "generatedBy" TEXT,
    "confidence" DOUBLE PRECISION,
    "modelUsed" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "recommandations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rgpd_blacklist" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "companySiren" TEXT,
    "phone" TEXT,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "rgpd_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "jobId" TEXT,
    "prospectId" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "langfuseTraceId" TEXT,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prospects_email_key" ON "prospects"("email");

-- CreateIndex
CREATE INDEX "prospects_status_idx" ON "prospects"("status");

-- CreateIndex
CREATE INDEX "prospects_email_idx" ON "prospects"("email");

-- CreateIndex
CREATE INDEX "prospects_companySiren_idx" ON "prospects"("companySiren");

-- CreateIndex
CREATE UNIQUE INDEX "raw_leads_prospectId_key" ON "raw_leads"("prospectId");

-- CreateIndex
CREATE INDEX "raw_leads_processed_idx" ON "raw_leads"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "raw_leads_source_sourceId_key" ON "raw_leads"("source", "sourceId");

-- CreateIndex
CREATE INDEX "prospect_scores_prospectId_isLatest_idx" ON "prospect_scores"("prospectId", "isLatest");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_coefficients_name_version_key" ON "scoring_coefficients"("name", "version");

-- CreateIndex
CREATE INDEX "generated_messages_prospectId_idx" ON "generated_messages"("prospectId");

-- CreateIndex
CREATE INDEX "email_sends_prospectId_idx" ON "email_sends"("prospectId");

-- CreateIndex
CREATE INDEX "email_sends_status_idx" ON "email_sends"("status");

-- CreateIndex
CREATE INDEX "linkedin_actions_prospectId_idx" ON "linkedin_actions"("prospectId");

-- CreateIndex
CREATE INDEX "prospect_sequences_prospectId_idx" ON "prospect_sequences"("prospectId");

-- CreateIndex
CREATE INDEX "bounce_events_email_idx" ON "bounce_events"("email");

-- CreateIndex
CREATE UNIQUE INDEX "nurture_prospects_prospectId_key" ON "nurture_prospects"("prospectId");

-- CreateIndex
CREATE INDEX "deals_crm_stage_idx" ON "deals_crm"("stage");

-- CreateIndex
CREATE INDEX "deals_crm_prospectId_idx" ON "deals_crm"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_dealId_key" ON "quotes"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quoteNumber_key" ON "quotes"("quoteNumber");

-- CreateIndex
CREATE INDEX "public_tenders_status_idx" ON "public_tenders"("status");

-- CreateIndex
CREATE INDEX "public_tenders_deadlineDate_idx" ON "public_tenders"("deadlineDate");

-- CreateIndex
CREATE UNIQUE INDEX "public_tenders_source_sourceId_key" ON "public_tenders"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_siren_key" ON "customers"("siren");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customer_health_scores_customerId_isLatest_idx" ON "customer_health_scores"("customerId", "isLatest");

-- CreateIndex
CREATE UNIQUE INDEX "metriques_daily_date_metricName_key" ON "metriques_daily"("date", "metricName");

-- CreateIndex
CREATE INDEX "alertes_severity_isResolved_idx" ON "alertes"("severity", "isResolved");

-- CreateIndex
CREATE INDEX "rgpd_blacklist_email_idx" ON "rgpd_blacklist"("email");

-- CreateIndex
CREATE INDEX "rgpd_blacklist_linkedinUrl_idx" ON "rgpd_blacklist"("linkedinUrl");

-- CreateIndex
CREATE INDEX "agent_events_agentName_eventType_idx" ON "agent_events"("agentName", "eventType");

-- CreateIndex
CREATE INDEX "agent_events_createdAt_idx" ON "agent_events"("createdAt");

-- AddForeignKey
ALTER TABLE "raw_leads" ADD CONSTRAINT "raw_leads_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_scores" ADD CONSTRAINT "prospect_scores_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_messages" ADD CONSTRAINT "generated_messages_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_messages" ADD CONSTRAINT "generated_messages_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "generated_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "prospect_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linkedin_actions" ADD CONSTRAINT "linkedin_actions_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linkedin_actions" ADD CONSTRAINT "linkedin_actions_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "prospect_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_generatedMessageId_fkey" FOREIGN KEY ("generatedMessageId") REFERENCES "generated_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES "email_sends"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_linkedinActionId_fkey" FOREIGN KEY ("linkedinActionId") REFERENCES "linkedin_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_sequences" ADD CONSTRAINT "prospect_sequences_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounce_events" ADD CONSTRAINT "bounce_events_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounce_events" ADD CONSTRAINT "bounce_events_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES "email_sends"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nurture_prospects" ADD CONSTRAINT "nurture_prospects_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nurture_interactions" ADD CONSTRAINT "nurture_interactions_nurtureId_fkey" FOREIGN KEY ("nurtureId") REFERENCES "nurture_prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nurture_interactions" ADD CONSTRAINT "nurture_interactions_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals_crm" ADD CONSTRAINT "deals_crm_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals_crm" ADD CONSTRAINT "deals_crm_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals_crm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_health_scores" ADD CONSTRAINT "customer_health_scores_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
