-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "public_tenders" ADD COLUMN     "cpvCodes" TEXT[],
ADD COLUMN     "departement" TEXT;

-- CreateTable
CREATE TABLE "audit_techniques" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "entrepriseNom" TEXT,
    "lhPerformance" INTEGER,
    "lhAccessibility" INTEGER,
    "lhBestPractices" INTEGER,
    "lhSeo" INTEGER,
    "lhMetrics" JSONB,
    "stackCms" TEXT,
    "stackCmsVersion" TEXT,
    "stackFramework" TEXT,
    "stackServer" TEXT,
    "stackComplete" JSONB,
    "axeViolations" INTEGER NOT NULL DEFAULT 0,
    "axeCritical" INTEGER NOT NULL DEFAULT 0,
    "axeSerious" INTEGER NOT NULL DEFAULT 0,
    "sslValid" BOOLEAN,
    "sslDaysRemaining" INTEGER,
    "hasSitemap" BOOLEAN,
    "hasRobotsTxt" BOOLEAN,
    "pageWeightMb" DOUBLE PRECISION,
    "screenshotPath" TEXT,
    "scoreTechnique" INTEGER NOT NULL DEFAULT 0,
    "classification" TEXT,
    "reasons" TEXT[],
    "leadId" TEXT,

    CONSTRAINT "audit_techniques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites_a_scanner" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "entrepriseNom" TEXT,
    "siret" TEXT,
    "segment" TEXT,
    "source" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "lastScannedAt" TIMESTAMP(3),
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sites_a_scanner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_techniques_url_idx" ON "audit_techniques"("url");

-- CreateIndex
CREATE INDEX "audit_techniques_scoreTechnique_idx" ON "audit_techniques"("scoreTechnique");

-- CreateIndex
CREATE UNIQUE INDEX "sites_a_scanner_url_key" ON "sites_a_scanner"("url");

-- CreateIndex
CREATE INDEX "sites_a_scanner_active_priority_idx" ON "sites_a_scanner"("active", "priority");

-- CreateIndex
CREATE INDEX "sites_a_scanner_lastScannedAt_idx" ON "sites_a_scanner"("lastScannedAt");
