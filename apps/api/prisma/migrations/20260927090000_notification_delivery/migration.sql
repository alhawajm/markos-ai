CREATE TABLE "notification_preferences" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(), "userId" UUID NOT NULL, "workspaceId" UUID NOT NULL,
  "pushPublishing" BOOLEAN NOT NULL DEFAULT false, "monthlyReportEmail" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_preferences_workspaceId_userId_key" ON "notification_preferences"("workspaceId", "userId");
CREATE INDEX "notification_preferences_userId_idx" ON "notification_preferences"("userId");
CREATE TABLE "push_devices" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "tokenHash" TEXT NOT NULL, "tokenCiphertext" TEXT NOT NULL,
  "platform" TEXT NOT NULL, "locale" "Locale" NOT NULL DEFAULT 'EN', "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_devices_tokenHash_key" ON "push_devices"("tokenHash");
CREATE INDEX "push_devices_userId_revokedAt_idx" ON "push_devices"("userId", "revokedAt");
CREATE TABLE "push_deliveries" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(), "workspaceId" UUID NOT NULL, "userId" UUID NOT NULL,
  "notificationId" UUID NOT NULL, "deviceId" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3), "ticketId" TEXT, "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_deliveries_notificationId_deviceId_key" ON "push_deliveries"("notificationId", "deviceId");
CREATE INDEX "push_deliveries_status_availableAt_idx" ON "push_deliveries"("status", "availableAt");
CREATE INDEX "push_deliveries_workspaceId_userId_idx" ON "push_deliveries"("workspaceId", "userId");
CREATE TABLE "analytics_report_deliveries" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(), "workspaceId" UUID NOT NULL, "userId" UUID NOT NULL, "month" TEXT NOT NULL,
  "locale" "Locale" NOT NULL DEFAULT 'EN', "requested" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseUntil" TIMESTAMP(3), "messageId" TEXT, "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_report_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "analytics_report_deliveries_workspaceId_userId_month_key" ON "analytics_report_deliveries"("workspaceId", "userId", "month");
CREATE INDEX "analytics_report_deliveries_status_availableAt_idx" ON "analytics_report_deliveries"("status", "availableAt");
