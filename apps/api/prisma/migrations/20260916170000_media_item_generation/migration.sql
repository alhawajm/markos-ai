-- Disposable execution history; no compatibility/backfill.
DELETE FROM "media_generation_jobs";
ALTER TYPE "MediaGenerationKind" ADD VALUE 'IMAGE';
ALTER TABLE "content_media_items" ADD COLUMN "generationIntent" UUID NOT NULL DEFAULT uuid_generate_v7();
CREATE UNIQUE INDEX "content_media_items_workspaceId_contentItemId_id_key" ON "content_media_items"("workspaceId", "contentItemId", "id");
ALTER TABLE "media_generation_jobs"
  ADD COLUMN "contentMediaItemId" UUID NOT NULL,
  ADD COLUMN "generationIntent" UUID NOT NULL,
  ADD COLUMN "requestedRevision" INTEGER NOT NULL CHECK ("requestedRevision" > 0),
  ADD COLUMN "attachmentApplied" BOOLEAN,
  ALTER COLUMN "durationSeconds" DROP NOT NULL,
  ALTER COLUMN "durationSeconds" DROP DEFAULT,
  DROP CONSTRAINT "media_generation_jobs_aspect_ratio_check",
  DROP CONSTRAINT "media_generation_jobs_duration_check",
  ADD CONSTRAINT "media_generation_jobs_aspect_ratio_check" CHECK ("aspectRatio" IN ('1:1', '4:5', '9:16')),
  ADD CONSTRAINT "media_generation_jobs_duration_check" CHECK ("durationSeconds" IS NULL OR "durationSeconds" > 0),
  ADD CONSTRAINT "media_generation_jobs_target_fkey" FOREIGN KEY ("workspaceId", "contentItemId", "contentMediaItemId")
    REFERENCES "content_media_items"("workspaceId", "contentItemId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
DROP INDEX "media_generation_jobs_active_content_key";
-- Multiple executions may finish; only the latest target intent can attach.
CREATE FUNCTION invalidate_media_generation_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."mediaAssetId", NEW."mediaKind", NEW."visualDirection", NEW."aspectRatio", NEW."generationDurationSeconds", NEW."deletedAt")
    IS DISTINCT FROM
    (OLD."mediaAssetId", OLD."mediaKind", OLD."visualDirection", OLD."aspectRatio", OLD."generationDurationSeconds", OLD."deletedAt") THEN
    NEW."generationIntent" := uuid_generate_v7();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER media_intent_before_update BEFORE UPDATE ON "content_media_items"
  FOR EACH ROW EXECUTE FUNCTION invalidate_media_generation_intent();
CREATE FUNCTION invalidate_content_generation_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."contentType" IS DISTINCT FROM OLD."contentType" OR NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt"
     OR (NEW."status" IS DISTINCT FROM OLD."status" AND NEW."status" NOT IN ('DRAFT','IN_REVIEW')) THEN
    UPDATE "content_media_items" SET "generationIntent" = uuid_generate_v7() WHERE "contentItemId" = NEW."id";
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER content_generation_intent AFTER UPDATE OF "contentType", "status", "deletedAt" ON "content_items"
  FOR EACH ROW EXECUTE FUNCTION invalidate_content_generation_intent();
CREATE FUNCTION immutable_generation_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."workspaceId", NEW."contentItemId", NEW."contentMediaItemId", NEW."generationIntent", NEW."requestedRevision", NEW."kind", NEW."prompt", NEW."aspectRatio", NEW."durationSeconds", NEW."provider")
    IS DISTINCT FROM
    (OLD."workspaceId", OLD."contentItemId", OLD."contentMediaItemId", OLD."generationIntent", OLD."requestedRevision", OLD."kind", OLD."prompt", OLD."aspectRatio", OLD."durationSeconds", OLD."provider") THEN
    RAISE EXCEPTION 'Generation execution request is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER generation_request_immutable BEFORE UPDATE ON "media_generation_jobs"
  FOR EACH ROW EXECUTE FUNCTION immutable_generation_request();
