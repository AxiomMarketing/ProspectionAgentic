CREATE TABLE "ao_analyse_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "analyseId" UUID NOT NULL REFERENCES "ao_analyses"("id"),
  "snapshotData" JSONB NOT NULL,
  "changedBy" VARCHAR(255),
  "changeType" VARCHAR(50) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX "idx_ao_analyse_history_analyse" ON "ao_analyse_history"("analyseId");
