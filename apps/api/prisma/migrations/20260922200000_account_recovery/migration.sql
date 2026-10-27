ALTER TABLE users ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3), ADD COLUMN "termsVersion" TEXT;
CREATE TABLE password_reset_challenges (
  id UUID PRIMARY KEY, "userId" UUID REFERENCES users(id) ON DELETE CASCADE,
  "authVersion" INTEGER, "codeHash" TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (attempts >= 0 AND attempts <= 5)
);
CREATE INDEX password_reset_challenges_user_idx ON password_reset_challenges("userId");
CREATE INDEX password_reset_challenges_expiry_idx ON password_reset_challenges("expiresAt");
CREATE TABLE auth_email_jobs (
  id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('RESET_CODE','PASSWORD_CHANGED','VERIFY')),
  "challengeId" UUID REFERENCES password_reset_challenges(id) ON DELETE SET NULL,
  payload TEXT, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','FAILED','IGNORED')),
  attempts INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "leaseUntil" TIMESTAMP(3), "leaseToken" UUID,
  "failureCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX auth_email_jobs_ready_idx ON auth_email_jobs(status,"availableAt");
CREATE INDEX auth_email_jobs_expiry_idx ON auth_email_jobs("expiresAt");
