-- Existing vectors deliberately retain NULL space and are re-indexed before cosine comparison.
ALTER TABLE "knowledge_vault" ADD COLUMN "embeddingSpace" TEXT;
