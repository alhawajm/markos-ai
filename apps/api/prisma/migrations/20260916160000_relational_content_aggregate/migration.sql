-- Clean authoring schema break. Existing content is disposable test data.
-- Deploy only with old API/AI/worker writers stopped. No legacy backfill.
BEGIN;
DELETE FROM "publish_attempts";
DELETE FROM "publish_jobs";
DELETE FROM "media_generation_jobs";
DELETE FROM "instagram_analytics" WHERE "contentItemId" IS NOT NULL;
DELETE FROM "ai_interactions" WHERE "contentItemId" IS NOT NULL;
DELETE FROM "content_calendars";
DELETE FROM "content_items";

ALTER TABLE "content_items" DROP COLUMN "mediaIds", DROP COLUMN "visualDirection",
  DROP COLUMN "carousel", DROP COLUMN "reelScript";
CREATE UNIQUE INDEX "content_items_workspaceId_id_key" ON "content_items"("workspaceId", "id");
CREATE UNIQUE INDEX "media_assets_workspaceId_id_key" ON "media_assets"("workspaceId", "id");
CREATE TYPE "ContentMediaKind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "ContentAspectRatio" AS ENUM ('1:1', '4:5', '9:16');

CREATE TABLE "content_media_items" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "contentItemId" UUID NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" >= 0),
  "mediaKind" "ContentMediaKind",
  "mediaAssetId" UUID,
  "purpose" TEXT, "title" TEXT, "body" TEXT, "visualDirection" TEXT,
  "aspectRatio" "ContentAspectRatio",
  "generationDurationSeconds" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "content_media_items_duration_check" CHECK (
    "generationDurationSeconds" IS NULL OR ("mediaKind" IS NOT DISTINCT FROM 'VIDEO'::"ContentMediaKind" AND "generationDurationSeconds" > 0)),
  CONSTRAINT "content_media_items_asset_kind_check" CHECK ("mediaAssetId" IS NULL OR "mediaKind" IS NOT NULL),
  CONSTRAINT "content_media_items_workspaceId_contentItemId_fkey" FOREIGN KEY ("workspaceId", "contentItemId") REFERENCES "content_items"("workspaceId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "content_media_items_workspaceId_mediaAssetId_fkey" FOREIGN KEY ("workspaceId", "mediaAssetId") REFERENCES "media_assets"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "content_media_items_workspaceId_id_key" ON "content_media_items"("workspaceId", "id");
CREATE INDEX "content_media_items_workspaceId_contentItemId_deletedAt_position_idx" ON "content_media_items"("workspaceId", "contentItemId", "deletedAt", "position");
CREATE INDEX "content_media_items_workspaceId_mediaAssetId_idx" ON "content_media_items"("workspaceId", "mediaAssetId");
CREATE UNIQUE INDEX "content_media_items_active_position_key" ON "content_media_items"("contentItemId", "position") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "content_media_items_active_asset_key" ON "content_media_items"("contentItemId", "mediaAssetId") WHERE "deletedAt" IS NULL AND "mediaAssetId" IS NOT NULL;

CREATE TABLE "content_reel_scripts" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "contentItemId" UUID NOT NULL,
  "hook" TEXT,
  "intendedDurationSeconds" INTEGER CHECK ("intendedDurationSeconds" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_reel_scripts_workspaceId_contentItemId_fkey" FOREIGN KEY ("workspaceId", "contentItemId") REFERENCES "content_items"("workspaceId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "content_reel_scripts_workspaceId_id_key" ON "content_reel_scripts"("workspaceId", "id");
CREATE UNIQUE INDEX "content_reel_scripts_workspaceId_contentItemId_key" ON "content_reel_scripts"("workspaceId", "contentItemId");

CREATE TABLE "content_reel_beats" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "reelScriptId" UUID NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" >= 0),
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_reel_beats_workspaceId_reelScriptId_fkey" FOREIGN KEY ("workspaceId", "reelScriptId") REFERENCES "content_reel_scripts"("workspaceId", "id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "content_reel_beats_workspaceId_reelScriptId_position_key" ON "content_reel_beats"("workspaceId", "reelScriptId", "position");

-- Child ownership/identity is immutable. Every child mutation touches the root,
-- reusing bump_content_revision; revisions may jump within a transaction.
CREATE FUNCTION touch_content_aggregate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id UUID; owner_workspace UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."id" IS DISTINCT FROM OLD."id" OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId") THEN
    RAISE EXCEPTION 'Authoring identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'content_reel_beats' THEN
    IF TG_OP = 'UPDATE' AND NEW."reelScriptId" IS DISTINCT FROM OLD."reelScriptId" THEN
      RAISE EXCEPTION 'Beat ownership is immutable' USING ERRCODE = '23514';
    END IF;
    SELECT "contentItemId", "workspaceId" INTO owner_id, owner_workspace FROM "content_reel_scripts"
      WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."reelScriptId" ELSE NEW."reelScriptId" END;
  ELSE
    IF TG_OP = 'UPDATE' AND NEW."contentItemId" IS DISTINCT FROM OLD."contentItemId" THEN
      RAISE EXCEPTION 'Creative ownership is immutable' USING ERRCODE = '23514';
    END IF;
    owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."contentItemId" ELSE NEW."contentItemId" END;
    owner_workspace := CASE WHEN TG_OP = 'DELETE' THEN OLD."workspaceId" ELSE NEW."workspaceId" END;
  END IF;
  UPDATE "content_items" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = owner_id AND "workspaceId" = owner_workspace;
  IF TG_TABLE_NAME = 'content_media_items' AND TG_OP <> 'DELETE' THEN
    IF NEW."deletedAt" IS NULL AND NEW."mediaAssetId" IS NOT NULL THEN
      -- Serialize attachment with soft deletion / MIME updates, not just FK
      -- key changes. Otherwise concurrent writes can both pass their checks.
      PERFORM "id" FROM "media_assets" WHERE "id" = NEW."mediaAssetId"
        AND "workspaceId" = NEW."workspaceId" AND "deletedAt" IS NULL FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Attachment is unavailable' USING ERRCODE = '23514'; END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['content_media_items', 'content_reel_scripts', 'content_reel_beats'] LOOP
    EXECUTE format('CREATE TRIGGER content_child_revision BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION touch_content_aggregate()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO markos_app USING ("workspaceId" = current_setting(''app.current_workspace'', true)::uuid) WITH CHECK ("workspaceId" = current_setting(''app.current_workspace'', true)::uuid)', t || '_workspace_rls', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO markos_app', t);
  END LOOP;
END $$;
GRANT USAGE ON TYPE "ContentMediaKind", "ContentAspectRatio" TO markos_app;

-- Cross-row format/cardinality checks run at commit so reorder/conversion can
-- use temporary positions and replace structures atomically.
CREATE FUNCTION validate_content_structure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_id UUID; root_type "ContentType"; item_count INTEGER; max_position INTEGER;
BEGIN
  root_id := NEW."id";
  SELECT "contentType" INTO root_type FROM "content_items" WHERE "id" = root_id AND "deletedAt" IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*), max("position") INTO item_count, max_position FROM "content_media_items"
    WHERE "contentItemId" = root_id AND "deletedAt" IS NULL;
  IF item_count < 1 OR item_count > (CASE WHEN root_type = 'CAROUSEL' THEN 10 ELSE 1 END) OR max_position <> item_count - 1 THEN
    RAISE EXCEPTION 'Invalid active media item count/order' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "content_media_items" m LEFT JOIN "media_assets" a ON a."id" = m."mediaAssetId"
    WHERE m."contentItemId" = root_id AND m."deletedAt" IS NULL AND (
      (root_type IN ('POST', 'CAROUSEL') AND m."mediaKind" IS DISTINCT FROM 'IMAGE'::"ContentMediaKind") OR
      (root_type = 'REEL' AND m."mediaKind" IS DISTINCT FROM 'VIDEO'::"ContentMediaKind") OR
      (m."mediaAssetId" IS NOT NULL AND (a."deletedAt" IS NOT NULL OR
        (m."mediaKind" = 'IMAGE' AND a."mimeType" <> 'image/jpeg') OR
        (m."mediaKind" = 'VIDEO' AND a."mimeType" <> 'video/mp4'))))) THEN
    RAISE EXCEPTION 'Incompatible attached media or item kind' USING ERRCODE = '23514';
  END IF;
  IF root_type <> 'REEL' AND EXISTS (SELECT 1 FROM "content_reel_scripts" WHERE "contentItemId" = root_id) THEN
    RAISE EXCEPTION 'Only Reels may own a Reel script' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "content_reel_beats" b JOIN "content_reel_scripts" s ON s."id" = b."reelScriptId"
    WHERE s."contentItemId" = root_id GROUP BY b."reelScriptId" HAVING max(b."position") <> count(*) - 1) THEN
    RAISE EXCEPTION 'Invalid beat order' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER content_structure_after_write AFTER INSERT OR UPDATE ON "content_items"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_content_structure();

CREATE FUNCTION protect_attached_media_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "content_media_items" m JOIN "content_items" c ON c."id" = m."contentItemId"
    WHERE m."mediaAssetId" = NEW."id" AND m."deletedAt" IS NULL AND c."deletedAt" IS NULL AND
      (NEW."deletedAt" IS NOT NULL OR (m."mediaKind" = 'IMAGE' AND NEW."mimeType" <> 'image/jpeg') OR
       (m."mediaKind" = 'VIDEO' AND NEW."mimeType" <> 'video/mp4'))) THEN
    RAISE EXCEPTION 'Detach active creative references before removing or changing media' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_attached_media BEFORE UPDATE OF "deletedAt", "mimeType" ON "media_assets"
  FOR EACH ROW EXECUTE FUNCTION protect_attached_media_asset();
COMMIT;
