CREATE INDEX IF NOT EXISTS knowledge_vault_embedding_hnsw_idx
  ON knowledge_vault
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
