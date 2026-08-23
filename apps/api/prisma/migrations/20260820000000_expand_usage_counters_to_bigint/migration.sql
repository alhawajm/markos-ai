-- Paid storage allowances exceed PostgreSQL's 32-bit INTEGER range.
ALTER TABLE "usage_counters"
  ALTER COLUMN "used" TYPE BIGINT,
  ALTER COLUMN "limit" TYPE BIGINT;
