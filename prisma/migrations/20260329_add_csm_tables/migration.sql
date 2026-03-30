-- AlterTable: Add 7 new fields to Customer
ALTER TABLE "customers" ADD COLUMN "typeProjet" TEXT;
ALTER TABLE "customers" ADD COLUMN "tier" TEXT;
ALTER TABLE "customers" ADD COLUMN "scopeDetaille" JSONB;
ALTER TABLE "customers" ADD COLUMN "conditionsPaiement" TEXT;
ALTER TABLE "customers" ADD COLUMN "notesVente" TEXT;
ALTER TABLE "customers" ADD COLUMN "dealCycleDays" INTEGER;
ALTER TABLE "customers" ADD COLUMN "engagementScoreFinal" DOUBLE PRECISION;

-- CreateIndex on Customer
CREATE INDEX "customers_typeProjet_idx" ON "customers"("typeProjet");

-- CreateTable: OnboardingStep
CREATE TABLE "onboarding_steps" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OnboardingRisk
CREATE TABLE "onboarding_risks" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "riskType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "daysSinceTrigger" INTEGER NOT NULL,
    "actionTaken" TEXT,

    CONSTRAINT "onboarding_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UpsellOpportunity
CREATE TABLE "upsell_opportunities" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dealId" TEXT,
    "productTarget" TEXT NOT NULL,
    "estimatedValue" DOUBLE PRECISION NOT NULL,
    "upsellScore" DOUBLE PRECISION NOT NULL,
    "priority" TEXT NOT NULL,
    "signalsDetected" JSONB NOT NULL,
    "blockerReasons" JSONB,
    "recommendedTiming" TEXT,
    "templateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'detected',
    "proposedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "convertedDealId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upsell_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NpsSurvey
CREATE TABLE "nps_surveys" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "sentiment" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "tool" TEXT NOT NULL DEFAULT 'typeform',
    "formId" TEXT,
    "responseId" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nps_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChurnSignal
CREATE TABLE "churn_signals" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "actionTaken" TEXT,
    "churnProbability" DOUBLE PRECISION,

    CONSTRAINT "churn_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReviewRequest
CREATE TABLE "review_requests" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dealId" TEXT,
    "npsScore" INTEGER,
    "platformTargets" JSONB NOT NULL,
    "sequenceStatus" TEXT NOT NULL DEFAULT 'pending',
    "email1SentAt" TIMESTAMP(3),
    "email2SentAt" TIMESTAMP(3),
    "email3SentAt" TIMESTAMP(3),
    "reviewReceived" BOOLEAN NOT NULL DEFAULT false,
    "reviewUrl" TEXT,
    "reviewScore" DOUBLE PRECISION,
    "reviewPlatform" TEXT,
    "reviewText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NegativeReview
CREATE TABLE "negative_reviews" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "platform" TEXT NOT NULL,
    "reviewUrl" TEXT NOT NULL,
    "reviewScore" DOUBLE PRECISION NOT NULL,
    "reviewText" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "responseText" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "escalatedTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'detected',

    CONSTRAINT "negative_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReferralProgram
CREATE TABLE "referral_programs" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dealId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "referralCode" TEXT NOT NULL,
    "commissionTier" TEXT NOT NULL,
    "totalCommissionEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReferralsSubmitted" INTEGER NOT NULL DEFAULT 0,
    "totalReferralsConverted" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3),
    "lastReferralAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReferralLead
CREATE TABLE "referral_leads" (
    "id" TEXT NOT NULL,
    "referralProgramId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "entreprise" TEXT NOT NULL,
    "besoin" TEXT NOT NULL,
    "telephone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactedAt" TIMESTAMP(3),
    "qualifiedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "dealValue" DOUBLE PRECISION,
    "commissionRate" DOUBLE PRECISION,
    "commissionAmount" DOUBLE PRECISION,
    "commissionPaid" BOOLEAN NOT NULL DEFAULT false,
    "commissionPaidAt" TIMESTAMP(3),
    "prospectId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectMilestone
CREATE TABLE "project_milestones" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dealId" TEXT,
    "phase" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "deliverableUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CsmMetricsDaily
CREATE TABLE "csm_metrics_daily" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "totalClients" INTEGER NOT NULL,
    "avgHealthScore" DOUBLE PRECISION NOT NULL,
    "churnRate" DOUBLE PRECISION NOT NULL,
    "nrr" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csm_metrics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RenewalOpportunity
CREATE TABLE "renewal_opportunities" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "renewalDate" TIMESTAMP(3),
    "mrrEur" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "renewal_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateUnique
ALTER TABLE "referral_programs" ADD CONSTRAINT "referral_programs_customerId_key" UNIQUE ("customerId");
ALTER TABLE "referral_programs" ADD CONSTRAINT "referral_programs_referralCode_key" UNIQUE ("referralCode");
ALTER TABLE "csm_metrics_daily" ADD CONSTRAINT "csm_metrics_daily_date_key" UNIQUE ("date");

-- CreateIndex: OnboardingStep
CREATE INDEX "onboarding_steps_customerId_status_idx" ON "onboarding_steps"("customerId", "status");
CREATE INDEX "onboarding_steps_dueDate_idx" ON "onboarding_steps"("dueDate");

-- CreateIndex: OnboardingRisk
CREATE INDEX "onboarding_risks_customerId_idx" ON "onboarding_risks"("customerId");
CREATE INDEX "onboarding_risks_severity_idx" ON "onboarding_risks"("severity");

-- CreateIndex: UpsellOpportunity
CREATE INDEX "upsell_opportunities_customerId_status_idx" ON "upsell_opportunities"("customerId", "status");
CREATE INDEX "upsell_opportunities_priority_idx" ON "upsell_opportunities"("priority");

-- CreateIndex: NpsSurvey
CREATE INDEX "nps_surveys_customerId_idx" ON "nps_surveys"("customerId");
CREATE INDEX "nps_surveys_type_status_idx" ON "nps_surveys"("type", "status");

-- CreateIndex: ChurnSignal
CREATE INDEX "churn_signals_customerId_idx" ON "churn_signals"("customerId");
CREATE INDEX "churn_signals_severity_resolvedAt_idx" ON "churn_signals"("severity", "resolvedAt");

-- CreateIndex: ReviewRequest
CREATE INDEX "review_requests_customerId_idx" ON "review_requests"("customerId");
CREATE INDEX "review_requests_sequenceStatus_idx" ON "review_requests"("sequenceStatus");

-- CreateIndex: NegativeReview
CREATE INDEX "negative_reviews_platform_idx" ON "negative_reviews"("platform");
CREATE INDEX "negative_reviews_status_idx" ON "negative_reviews"("status");

-- CreateIndex: ReferralProgram
CREATE INDEX "referral_programs_status_idx" ON "referral_programs"("status");
CREATE INDEX "referral_programs_referralCode_idx" ON "referral_programs"("referralCode");

-- CreateIndex: ReferralLead
CREATE INDEX "referral_leads_referralProgramId_idx" ON "referral_leads"("referralProgramId");
CREATE INDEX "referral_leads_status_idx" ON "referral_leads"("status");
CREATE INDEX "referral_leads_referralCode_idx" ON "referral_leads"("referralCode");

-- CreateIndex: ProjectMilestone
CREATE INDEX "project_milestones_customerId_status_idx" ON "project_milestones"("customerId", "status");

-- CreateIndex: CsmMetricsDaily
CREATE INDEX "csm_metrics_daily_date_idx" ON "csm_metrics_daily"("date");

-- CreateIndex: RenewalOpportunity
CREATE INDEX "renewal_opportunities_customerId_idx" ON "renewal_opportunities"("customerId");

-- AddForeignKey: OnboardingStep -> Customer
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: OnboardingRisk -> Customer
ALTER TABLE "onboarding_risks" ADD CONSTRAINT "onboarding_risks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: UpsellOpportunity -> Customer
ALTER TABLE "upsell_opportunities" ADD CONSTRAINT "upsell_opportunities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: NpsSurvey -> Customer
ALTER TABLE "nps_surveys" ADD CONSTRAINT "nps_surveys_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ChurnSignal -> Customer
ALTER TABLE "churn_signals" ADD CONSTRAINT "churn_signals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ReviewRequest -> Customer
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ReferralProgram -> Customer
ALTER TABLE "referral_programs" ADD CONSTRAINT "referral_programs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ReferralLead -> ReferralProgram
ALTER TABLE "referral_leads" ADD CONSTRAINT "referral_leads_referralProgramId_fkey" FOREIGN KEY ("referralProgramId") REFERENCES "referral_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ProjectMilestone -> Customer
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: RenewalOpportunity -> Customer
ALTER TABLE "renewal_opportunities" ADD CONSTRAINT "renewal_opportunities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
