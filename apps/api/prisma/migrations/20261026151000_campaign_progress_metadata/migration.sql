ALTER TABLE campaign_generation_jobs
  ADD COLUMN "totalWeeks" INTEGER,
  ADD COLUMN "completedWeeks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN resumable BOOLEAN NOT NULL DEFAULT false;
