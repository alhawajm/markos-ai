import type { AdminModelConfiguration } from "@markos/shared-types";
import type { AdminModelSettingKeyInput } from "@markos/validation";
import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";

const modelSettingFallbacks = {
  IMAGE_MODEL_FALLBACK: env.IMAGE_MODEL_FALLBACK,
  IMAGE_MODEL_PRIMARY: env.IMAGE_MODEL_PRIMARY,
  LLM_PRIMARY_MODEL: env.LLM_PRIMARY_MODEL
} as const satisfies Record<AdminModelSettingKeyInput, string | undefined>;

const modelSettingKeys = Object.keys(modelSettingFallbacks) as AdminModelSettingKeyInput[];

export async function resolveModelSetting(key: AdminModelSettingKeyInput): Promise<string> {
  const [row] = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT "value" FROM "model_settings"
    WHERE "key" = ${key} AND "deletedAt" IS NULL
    LIMIT 1
  `;
  const fallback = modelSettingFallbacks[key];

  return row?.value ?? fallback ?? "";
}

export async function getModelConfiguration(): Promise<AdminModelConfiguration> {
  const rows = await prisma.$queryRaw<Array<{ key: string; updatedAt: Date; value: string }>>`
    SELECT "key", "value", "updatedAt" FROM "model_settings"
    WHERE "deletedAt" IS NULL AND "key" IN (${Prisma.join(modelSettingKeys)})
  `;
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  const models = modelSettingKeys.map((key) => {
    const row = rowByKey.get(key);

    if (row !== undefined) {
      return {
        key,
        source: "database" as const,
        updatedAt: row.updatedAt.toISOString(),
        value: row.value
      };
    }

    const fallback = modelSettingFallbacks[key];

    return {
      key,
      source: "environment" as const,
      ...(fallback === undefined ? {} : { value: fallback })
    };
  });
  const uniqueSources = new Set(models.map((model) => model.source));

  return {
    editable: true,
    models,
    source: uniqueSources.size === 1 ? models[0]?.source ?? "environment" : "mixed"
  };
}

export async function updateModelSetting(input: {
  actorId: string;
  key: AdminModelSettingKeyInput;
  value: string;
  workspaceId: string;
}): Promise<AdminModelConfiguration> {
  await prisma.$transaction(async (tx) => {
    const [previous] = await tx.$queryRaw<Array<{ id: string; value: string }>>`
      SELECT "id", "value" FROM "model_settings"
      WHERE "key" = ${input.key} AND "deletedAt" IS NULL
      LIMIT 1
    `;
    const row =
      previous === undefined
        ? (
            await tx.$queryRaw<Array<{ id: string; value: string }>>`
              INSERT INTO "model_settings" ("key", "value", "updatedAt")
              VALUES (${input.key}, ${input.value}, NOW())
              RETURNING "id", "value"
            `
          )[0]
        : (
            await tx.$queryRaw<Array<{ id: string; value: string }>>`
              UPDATE "model_settings"
              SET "value" = ${input.value}, "updatedAt" = NOW()
              WHERE "id" = ${previous.id}
              RETURNING "id", "value"
            `
          )[0];

    if (row === undefined) {
      throw new Error("Model setting update failed");
    }

    await tx.auditLog.create({
      data: {
        action: "MODEL_SETTING_UPDATED",
        actorId: input.actorId,
        metadata: {
          key: input.key,
          nextValue: row.value,
          previousSource: previous === undefined ? "environment" : "database",
          previousValue: previous?.value ?? modelSettingFallbacks[input.key]
        },
        targetId: row.id,
        targetType: "ModelSetting",
        workspaceId: input.workspaceId
      }
    });
  });

  return getModelConfiguration();
}
