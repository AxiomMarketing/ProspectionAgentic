CREATE TABLE "ao_analyse_history" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "analyseId" TEXT NOT NULL,
  "snapshotData" JSONB NOT NULL,
  "changedBy" VARCHAR(255),
  "changeType" VARCHAR(50) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT "ao_analyse_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_ao_analyse_history_analyse" ON "ao_analyse_history"("analyseId");
ALTER TABLE "ao_analyse_history" ADD CONSTRAINT "ao_analyse_history_analyseId_fkey" FOREIGN KEY ("analyseId") REFERENCES "ao_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
