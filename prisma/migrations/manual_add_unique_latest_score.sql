CREATE UNIQUE INDEX IF NOT EXISTS prospect_scores_one_latest ON prospect_scores (prospect_id) WHERE is_latest = true;
