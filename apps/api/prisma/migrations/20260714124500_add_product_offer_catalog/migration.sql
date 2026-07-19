-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "priceMinor" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BHD',
    "salesChannels" TEXT[],
    "benefits" TEXT[],
    "mediaAssetIds" UUID[],
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "productId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" INTEGER,
    "compareAtPriceMinor" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BHD',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "terms" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_workspaceId_status_idx" ON "products"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "products_workspaceId_category_idx" ON "products"("workspaceId", "category");

-- CreateIndex
CREATE INDEX "offers_workspaceId_status_idx" ON "offers"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "offers_workspaceId_productId_idx" ON "offers"("workspaceId", "productId");

-- CreateIndex
CREATE INDEX "offers_workspaceId_startsAt_idx" ON "offers"("workspaceId", "startsAt");

-- CreateIndex
CREATE INDEX "offers_workspaceId_endsAt_idx" ON "offers"("workspaceId", "endsAt");

-- Grants and RLS
GRANT USAGE ON TYPE "ProductStatus" TO markos_app;
GRANT USAGE ON TYPE "OfferStatus" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "products" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "offers" TO markos_app;

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_workspace_rls" ON "products"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "offers_workspace_rls" ON "offers"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
