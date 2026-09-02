-- Campaign generation reads the `campaigns` plan-limit key. Existing plans still
-- carry the pre-rename `strategies` key, so migrate it without overwriting any
-- explicitly configured Campaign limit.

UPDATE "plans"
SET "limits" = jsonb_set(
  "limits" - 'strategies',
  '{campaigns}',
  COALESCE("limits" -> 'campaigns', "limits" -> 'strategies'),
  true
)
WHERE jsonb_typeof("limits") = 'object'
  AND ("limits" ? 'strategies' OR "limits" ? 'campaigns');
