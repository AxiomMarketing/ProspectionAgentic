-- CreateTable: AoAnalyse
CREATE TABLE "ao_analyses" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentStep" TEXT,
    "errorMessage" TEXT,
    "scoreTotal" DOUBLE PRECISION,
    "scorePertinence" DOUBLE PRECISION,
    "scoreCompetence" DOUBLE PRECISION,
    "scoreBudget" DOUBLE PRECISION,
    "scoreConcurrence" DOUBLE PRECISION,
    "decision" TEXT,
    "decisionReason" TEXT,
    "dceRawText" TEXT,
    "dcePages" INTEGER,
    "langfuseTraceId" TEXT,

    CONSTRAINT "ao_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ao_analyses_tenderId_key" ON "ao_analyses"("tenderId");
CREATE INDEX "ao_analyses_tenderId_idx" ON "ao_analyses"("tenderId");
CREATE INDEX "ao_analyses_status_idx" ON "ao_analyses"("status");

-- AddForeignKey
ALTER TABLE "ao_analyses" ADD CONSTRAINT "ao_analyses_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "public_tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AoExigence
CREATE TABLE "ao_exigences" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "met" BOOLEAN,
    "comment" TEXT,

    CONSTRAINT "ao_exigences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ao_exigences_analyseId_idx" ON "ao_exigences"("analyseId");
ALTER TABLE "ao_exigences" ADD CONSTRAINT "ao_exigences_analyseId_fkey" FOREIGN KEY ("analyseId") REFERENCES "ao_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AoQuestion
CREATE TABLE "ao_questions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyseId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "ao_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ao_questions_analyseId_idx" ON "ao_questions"("analyseId");
ALTER TABLE "ao_questions" ADD CONSTRAINT "ao_questions_analyseId_fkey" FOREIGN KEY ("analyseId") REFERENCES "ao_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AoDossierAdmin
CREATE TABLE "ao_dossiers_admin" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analyseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dc1Generated" BOOLEAN NOT NULL DEFAULT false,
    "dc2Generated" BOOLEAN NOT NULL DEFAULT false,
    "kbisChecked" BOOLEAN NOT NULL DEFAULT false,
    "assuranceChecked" BOOLEAN NOT NULL DEFAULT false,
    "referencesAdded" BOOLEAN NOT NULL DEFAULT false,
    "documents" JSONB,
    "notes" TEXT,

    CONSTRAINT "ao_dossiers_admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ao_dossiers_admin_analyseId_key" ON "ao_dossiers_admin"("analyseId");
ALTER TABLE "ao_dossiers_admin" ADD CONSTRAINT "ao_dossiers_admin_analyseId_fkey" FOREIGN KEY ("analyseId") REFERENCES "ao_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AoOffreFinanciere
CREATE TABLE "ao_offres_financieres" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analyseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "montantHtEur" DOUBLE PRECISION,
    "montantTtcEur" DOUBLE PRECISION,
    "tauxTva" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "margeEstimee" DOUBLE PRECISION,
    "chargeJours" DOUBLE PRECISION,
    "tauxJournalier" DOUBLE PRECISION,
    "decomposition" JSONB,
    "variantes" JSONB,
    "notes" TEXT,

    CONSTRAINT "ao_offres_financieres_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ao_offres_financieres_analyseId_key" ON "ao_offres_financieres"("analyseId");
ALTER TABLE "ao_offres_financieres" ADD CONSTRAINT "ao_offres_financieres_analyseId_fkey" FOREIGN KEY ("analyseId") REFERENCES "ao_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AoMemoireTechnique
CREATE TABLE "ao_memoires_techniques" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analyseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approche" TEXT,
    "methodologie" TEXT,
    "planningJson" JSONB,
    "equipeJson" JSONB,
    "referencesJson" JSONB,
    "differenciants" TEXT,
    "wordCount" INTEGER,
    "aiScoreRisk" DOUBLE PRECISION,
    "humanizedAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "langfuseTraceId" TEXT,

    CONSTRAINT "ao_memoires_techniques_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ao_memoires_techniques_analyseId_key" ON "ao_memoires_techniques"("analyseId");
ALTER TABLE "ao_memoires_techniques" ADD CONSTRAINT "ao_memoires_techniques_analyseId_fkey" FOREIGN KEY ("analyseId") REFERENCES "ao_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AoControleQa
CREATE TABLE "ao_controles_qa" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analyseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checksJson" JSONB,
    "errorsFound" INTEGER NOT NULL DEFAULT 0,
    "warningsFound" INTEGER NOT NULL DEFAULT 0,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "langfuseTraceId" TEXT,

    CONSTRAINT "ao_controles_qa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ao_controles_qa_analyseId_key" ON "ao_controles_qa"("analyseId");
ALTER TABLE "ao_controles_qa" ADD CONSTRAINT "ao_controles_qa_analyseId_fkey" FOREIGN KEY ("analyseId") REFERENCES "ao_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
