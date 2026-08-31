CREATE TYPE "OfferingKind" AS ENUM ('PRODUCT', 'SERVICE', 'UNSPECIFIED');
CREATE TYPE "OfferingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "OfferingPriceType" AS ENUM ('UNSPECIFIED', 'FIXED', 'FROM', 'RANGE', 'QUOTE');
CREATE TYPE "OfferingSourceType" AS ENUM ('OWNER', 'DOCUMENT', 'INSTAGRAM');
CREATE TYPE "OfferingProjectionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TABLE "offering_catalogs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "summary" TEXT,
    "differentiators" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "priceRange" TEXT,
    "salesChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceType" "OfferingSourceType" NOT NULL DEFAULT 'OWNER',
    "projectionStatus" "OfferingProjectionStatus" NOT NULL DEFAULT 'PENDING',
    "projectedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "offering_catalogs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offering_catalog_revisions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "catalogId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sourceType" "OfferingSourceType" NOT NULL,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offering_catalog_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offerings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "catalogId" UUID NOT NULL,
    "kind" "OfferingKind" NOT NULL DEFAULT 'UNSPECIFIED',
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameAr" TEXT,
    "category" TEXT,
    "description" TEXT,
    "priceType" "OfferingPriceType" NOT NULL DEFAULT 'UNSPECIFIED',
    "priceMinor" INTEGER,
    "minPriceMinor" INTEGER,
    "maxPriceMinor" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BHD',
    "status" "OfferingStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceType" "OfferingSourceType" NOT NULL DEFAULT 'OWNER',
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "offerings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offering_revisions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sourceType" "OfferingSourceType" NOT NULL,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offering_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offering_catalogs_workspaceId_key" ON "offering_catalogs"("workspaceId");
CREATE INDEX "offering_catalogs_workspaceId_idx" ON "offering_catalogs"("workspaceId");
CREATE UNIQUE INDEX "offering_catalog_revisions_catalogId_version_key" ON "offering_catalog_revisions"("catalogId", "version");
CREATE INDEX "offering_catalog_revisions_workspaceId_catalogId_idx" ON "offering_catalog_revisions"("workspaceId", "catalogId");
CREATE UNIQUE INDEX "offerings_workspaceId_normalizedName_key" ON "offerings"("workspaceId", "normalizedName");
CREATE INDEX "offerings_workspaceId_catalogId_status_idx" ON "offerings"("workspaceId", "catalogId", "status");
CREATE UNIQUE INDEX "offering_revisions_offeringId_version_key" ON "offering_revisions"("offeringId", "version");
CREATE INDEX "offering_revisions_workspaceId_offeringId_idx" ON "offering_revisions"("workspaceId", "offeringId");

GRANT USAGE ON TYPE "OfferingKind", "OfferingStatus", "OfferingPriceType", "OfferingSourceType", "OfferingProjectionStatus" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "offering_catalogs", "offering_catalog_revisions", "offerings", "offering_revisions" TO markos_app;

INSERT INTO "offering_catalogs" (
    "id",
    "workspaceId",
    "summary",
    "differentiators",
    "priceRange",
    "salesChannels",
    "version",
    "sourceType",
    "projectionStatus",
    "projectedVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    uuid_generate_v7(),
    vault."workspaceId",
    NULLIF(vault."value"->>'summary', ''),
    CASE
      WHEN jsonb_typeof(vault."value"->'differentiators') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(vault."value"->'differentiators'))
      ELSE ARRAY[]::TEXT[]
    END,
    NULLIF(vault."value"->>'priceRange', ''),
    CASE
      WHEN jsonb_typeof(vault."value"->'salesChannels') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(vault."value"->'salesChannels'))
      ELSE ARRAY[]::TEXT[]
    END,
    vault."version",
    'OWNER',
    'READY',
    vault."version",
    vault."createdAt",
    vault."updatedAt"
FROM "knowledge_vault" AS vault
WHERE vault."section" = 'PRODUCTS'
  AND vault."key" = 'catalog'
  AND vault."deletedAt" IS NULL
ON CONFLICT ("workspaceId") DO NOTHING;

WITH legacy_items AS (
    SELECT
        catalog."id" AS "catalogId",
        catalog."workspaceId",
        item."value" AS "item",
        lower(trim(item."value"->>'name')) AS "normalizedName",
        row_number() OVER (
            PARTITION BY catalog."workspaceId", lower(trim(item."value"->>'name'))
            ORDER BY item."ordinality"
        ) AS "duplicateRank"
    FROM "offering_catalogs" AS catalog
    JOIN "knowledge_vault" AS vault
      ON vault."workspaceId" = catalog."workspaceId"
     AND vault."section" = 'PRODUCTS'
     AND vault."key" = 'catalog'
     AND vault."deletedAt" IS NULL
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(vault."value"->'items') = 'array' THEN vault."value"->'items'
          ELSE '[]'::jsonb
        END
    ) WITH ORDINALITY AS item("value", "ordinality")
    WHERE NULLIF(trim(item."value"->>'name'), '') IS NOT NULL
), normalized_items AS (
    SELECT
        *,
        CASE
          WHEN ("item"->>'priceMinor') ~ '^[0-9]+$'
           AND ("item"->>'priceMinor')::numeric <= 2147483647
          THEN ("item"->>'priceMinor')::integer
          ELSE NULL
        END AS "validPriceMinor"
    FROM legacy_items
    WHERE "duplicateRank" = 1
)
INSERT INTO "offerings" (
    "id",
    "workspaceId",
    "catalogId",
    "kind",
    "name",
    "normalizedName",
    "category",
    "description",
    "priceType",
    "priceMinor",
    "currency",
    "status",
    "version",
    "sourceType",
    "createdAt",
    "updatedAt"
)
SELECT
    uuid_generate_v7(),
    "workspaceId",
    "catalogId",
    CASE
      WHEN "item"->>'kind' = 'PRODUCT' THEN 'PRODUCT'::"OfferingKind"
      WHEN "item"->>'kind' = 'SERVICE' THEN 'SERVICE'::"OfferingKind"
      ELSE 'UNSPECIFIED'::"OfferingKind"
    END,
    trim("item"->>'name'),
    "normalizedName",
    NULLIF(trim("item"->>'category'), ''),
    NULLIF(trim("item"->>'description'), ''),
    CASE WHEN "validPriceMinor" IS NULL THEN 'UNSPECIFIED'::"OfferingPriceType" ELSE 'FIXED'::"OfferingPriceType" END,
    "validPriceMinor",
    CASE WHEN length("item"->>'currency') = 3 THEN upper("item"->>'currency') ELSE 'BHD' END,
    'ACTIVE',
    1,
    'OWNER',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM normalized_items
ON CONFLICT ("workspaceId", "normalizedName") DO NOTHING;

INSERT INTO "offering_catalog_revisions" (
    "id",
    "workspaceId",
    "catalogId",
    "version",
    "snapshot",
    "sourceType",
    "createdAt"
)
SELECT
    uuid_generate_v7(),
    catalog."workspaceId",
    catalog."id",
    catalog."version",
    jsonb_build_object(
      'summary', catalog."summary",
      'differentiators', to_jsonb(catalog."differentiators"),
      'priceRange', catalog."priceRange",
      'salesChannels', to_jsonb(catalog."salesChannels")
    ),
    'OWNER',
    catalog."createdAt"
FROM "offering_catalogs" AS catalog
ON CONFLICT ("catalogId", "version") DO NOTHING;

INSERT INTO "offering_revisions" (
    "id",
    "workspaceId",
    "offeringId",
    "version",
    "snapshot",
    "sourceType",
    "createdAt"
)
SELECT
    uuid_generate_v7(),
    offering."workspaceId",
    offering."id",
    offering."version",
    jsonb_build_object(
      'kind', offering."kind",
      'name', offering."name",
      'normalizedName', offering."normalizedName",
      'category', offering."category",
      'description', offering."description",
      'priceType', offering."priceType",
      'priceMinor', offering."priceMinor",
      'currency', offering."currency",
      'status', offering."status"
    ),
    'OWNER',
    offering."createdAt"
FROM "offerings" AS offering
ON CONFLICT ("offeringId", "version") DO NOTHING;

ALTER TABLE "offering_catalogs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offering_catalogs_workspace_rls" ON "offering_catalogs" FOR ALL TO markos_app
  USING ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid);
ALTER TABLE "offering_catalog_revisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offering_catalog_revisions_workspace_rls" ON "offering_catalog_revisions" FOR ALL TO markos_app
  USING ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid);
ALTER TABLE "offerings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offerings_workspace_rls" ON "offerings" FOR ALL TO markos_app
  USING ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid);
ALTER TABLE "offering_revisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offering_revisions_workspace_rls" ON "offering_revisions" FOR ALL TO markos_app
  USING ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid);
