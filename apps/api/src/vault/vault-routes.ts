import type { FastifyInstance } from "fastify";
import { upsertVaultSectionSchema, vaultRagSearchSchema, vaultSectionSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  getVaultScore,
  listVault,
  listVaultEntryHistory,
  listVaultSection,
  searchVaultContext,
  upsertVaultSection
} from "./vault-service";

export async function registerVaultRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/vault",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await listVault(workspaceId));
    }
  );

  app.get(
    "/v1/vault/score",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getVaultScore(workspaceId));
    }
  );

  app.post(
    "/v1/vault/rag/search",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:read"]
      }
    },
    async (request, reply) => {
      const parsed = vaultRagSearchSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Vault RAG search request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await searchVaultContext(workspaceId, parsed.data));
    }
  );

  app.get(
    "/v1/vault/:section/:key/history",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:read"]
      }
    },
    async (request, reply) => {
      const params = request.params as { key?: string; section?: string };
      const section = parseSection(params.section);

      if (section === undefined) {
        return reply.status(404).send(errorEnvelope("VAULT_SECTION_NOT_FOUND", "Unknown Vault section"));
      }

      if (params.key === undefined || params.key.trim().length === 0 || params.key.length > 120) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Vault key"));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await listVaultEntryHistory(workspaceId, section, params.key));
    }
  );

  app.get(
    "/v1/vault/:section",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:read"]
      }
    },
    async (request, reply) => {
      const section = parseSection((request.params as { section?: string }).section);

      if (section === undefined) {
        return reply.status(404).send(errorEnvelope("VAULT_SECTION_NOT_FOUND", "Unknown Vault section"));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await listVaultSection(workspaceId, section));
    }
  );

  app.put(
    "/v1/vault/:section",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:write"]
      }
    },
    async (request, reply) => {
      const section = parseSection((request.params as { section?: string }).section);

      if (section === undefined) {
        return reply.status(404).send(errorEnvelope("VAULT_SECTION_NOT_FOUND", "Unknown Vault section"));
      }

      const parsed = upsertVaultSectionSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Vault section payload", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await upsertVaultSection(workspaceId, section, parsed.data));
    }
  );
}

function parseSection(section: string | undefined) {
  return vaultSectionSchema.safeParse(section?.toUpperCase()).success
    ? vaultSectionSchema.parse(section?.toUpperCase())
    : undefined;
}
