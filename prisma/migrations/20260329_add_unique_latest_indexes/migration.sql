-- Prevent duplicate isLatest=true for same prospect
CREATE UNIQUE INDEX "idx_prospect_score_latest" ON "prospect_scores" ("prospectId") WHERE "isLatest" = true;

-- Same for CustomerHealthScore
CREATE UNIQUE INDEX "idx_customer_health_score_latest" ON "customer_health_scores" ("customerId") WHERE "isLatest" = true;
