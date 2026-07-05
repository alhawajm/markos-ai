CREATE TABLE "model_settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "model_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "model_settings_key_key" ON "model_settings"("key");
