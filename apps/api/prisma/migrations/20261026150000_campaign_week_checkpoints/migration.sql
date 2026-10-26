ALTER TABLE campaign_generation_jobs ADD COLUMN checkpoint JSONB;
CREATE INDEX campaign_generation_jobs_status_updatedAt_idx ON campaign_generation_jobs(status, "updatedAt");
