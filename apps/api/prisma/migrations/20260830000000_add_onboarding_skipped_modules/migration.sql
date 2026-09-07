ALTER TABLE "workspaces" ADD COLUMN "onboardingSkippedModules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
