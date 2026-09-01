import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type { OfferingDocumentAnalysis, OfferingDocumentFile, Prisma } from "@prisma/client";
import type {
  ApproveOfferingDocumentAnalysisResult,
  OfferingDocumentAnalysisRecord,
  OfferingDocumentCleanupResult,
  OfferingDocumentExtraction
} from "@markos/shared-types";
import type { ApproveOfferingDocumentAnalysisInput, CreateOfferingDocumentAnalysisInput } from "@markos/validation";
import { analyzeOfferingDocuments, offeringDocumentExtractionSchema } from "../ai/offering-document-client";
import { AiServiceRequestError } from "../ai/request";
import { prisma } from "../db/prisma";
import { deleteStoredMedia, MediaStorageError, readStoredMedia, storeWorkspaceMedia } from "../media/storage-service";
import { businessProfileAgentName, getBusinessProfileState } from "../onboarding/business-profile-service";
import { getOnboardingState } from "../onboarding/onboarding-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore } from "../vault/vault-service";
import { saveOfferingCatalog, type OfferingCatalogInput } from "./offering-catalog-service";

const analysisAgentName = "OFFERING_DOCUMENT_RESOLVER";
const analysisLifetimeMs = 24 * 60 * 60 * 1000;
const staleProcessingMs = 3 * 60 * 1000;
const maxFileBytes = 8_000_000;
const maxTotalBytes = 12_000_000;
const localCurrency = "BHD";
const activeStatuses = ["PROCESSING", "READY", "FAILED"] as const;

type ValidatedUpload = {
  bytes: Buffer;
  checksumSha256: string;
  filename: string;
  mimeType: string;
};

export class OfferingDocumentInvalidError extends Error {}
export class OfferingDocumentAnalysisNotFoundError extends Error {}
export class OfferingDocumentAnalysisConflictError extends Error {}

export async function getActiveOfferingDocumentAnalysis(workspaceId: string): Promise<OfferingDocumentAnalysisRecord | null> {
  const analysis = await prisma.offeringDocumentAnalysis.findFirst({
    where: { workspaceId, status: { in: [...activeStatuses] } },
    orderBy: { createdAt: "desc" }
  });
  if (analysis === null) return null;

  const now = new Date();
  if (analysis.expiresAt <= now) {
    await expireAnalysis(analysis);
    return null;
  }
  if (analysis.status === "PROCESSING" && analysis.updatedAt <= new Date(now.getTime() - staleProcessingMs)) {
    await markFailed(analysis.id, "OFFERING_DOCUMENT_ANALYSIS_INTERRUPTED");
  }
  return getAnalysisRecord(workspaceId, analysis.id);
}

export async function createOfferingDocumentAnalysis(workspaceId: string, input: CreateOfferingDocumentAnalysisInput): Promise<OfferingDocumentAnalysisRecord> {
  const existing = await getActiveOfferingDocumentAnalysis(workspaceId);
  if (existing !== null) {
    throw new OfferingDocumentAnalysisConflictError("Review or discard the current document analysis before uploading another");
  }

  const uploads = validateUploads(input);
  let analysis: OfferingDocumentAnalysis;
  try {
    analysis = await prisma.offeringDocumentAnalysis.create({
      data: {
        workspaceId,
        expiresAt: new Date(Date.now() + analysisLifetimeMs)
      }
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new OfferingDocumentAnalysisConflictError("Review or discard the current document analysis before uploading another");
    }
    throw error;
  }

  try {
    for (const upload of uploads) {
      const stored = await storeWorkspaceMedia({
        workspaceId,
        filename: upload.filename,
        contentType: upload.mimeType,
        bytes: upload.bytes
      });
      await prisma.offeringDocumentFile.create({
        data: {
          workspaceId,
          analysisId: analysis.id,
          filename: upload.filename,
          mimeType: upload.mimeType,
          sizeBytes: upload.bytes.byteLength,
          checksumSha256: upload.checksumSha256,
          storageKey: stored.key
        }
      });
    }
  } catch (error) {
    await cleanupAnalysisFiles(workspaceId, analysis.id).catch(() => undefined);
    await prisma.offeringDocumentAnalysis.update({
      where: { id: analysis.id },
      data: { status: "FAILED", failureCode: failureCode(error) }
    });
    throw error;
  }

  return runOfferingDocumentAnalysis(workspaceId, analysis.id);
}

export async function retryOfferingDocumentAnalysis(workspaceId: string, analysisId: string): Promise<OfferingDocumentAnalysisRecord> {
  const analysis = await findAnalysis(workspaceId, analysisId);
  if (analysis.status !== "FAILED") {
    throw new OfferingDocumentAnalysisConflictError("Only a failed document analysis can be retried");
  }
  if (analysis.expiresAt <= new Date()) {
    await expireAnalysis(analysis);
    throw new OfferingDocumentAnalysisConflictError("This document analysis has expired");
  }
  return runOfferingDocumentAnalysis(workspaceId, analysis.id);
}

export async function approveOfferingDocumentAnalysis(
  workspaceId: string,
  analysisId: string,
  input: ApproveOfferingDocumentAnalysisInput,
  options: { preserveApprovedProfile?: boolean } = {}
): Promise<ApproveOfferingDocumentAnalysisResult> {
  const analysis = await findAnalysis(workspaceId, analysisId);
  if (analysis.status !== "READY" || analysis.interactionId === null) {
    throw new OfferingDocumentAnalysisConflictError("This document analysis is not ready for approval");
  }

  const result = offeringDocumentExtractionSchema.safeParse(analysis.result);
  if (!result.success) throw new OfferingDocumentAnalysisConflictError("The analysis result is unavailable");

  await cleanupAnalysisFiles(workspaceId, analysis.id);
  await saveOfferingCatalog(workspaceId, input.catalog, { sourceType: "DOCUMENT", sourceRef: analysis.id });
  const vaultScore = await getVaultScore(workspaceId);
  const edited = JSON.stringify(catalogForComparison(result.data.catalog)) !== JSON.stringify(catalogForComparison(input.catalog));
  const interaction = await prisma.aiInteraction.findFirstOrThrow({
    where: { id: analysis.interactionId, workspaceId, agent: analysisAgentName, deletedAt: null }
  });
  const interactionResponse = readRecord(interaction.response);
  const approvedAt = new Date();
  const preserveApprovedProfile = options.preserveApprovedProfile === true && (await getBusinessProfileState(workspaceId)).status === "APPROVED";

  await prisma.$transaction([
    prisma.offeringDocumentAnalysis.update({
      where: { id: analysis.id },
      data: { status: "APPROVED", approvedAt, failureCode: null }
    }),
    prisma.aiInteraction.update({
      where: { id: interaction.id },
      data: {
        accepted: true,
        edited,
        response: {
          ...interactionResponse,
          approvedCatalog: input.catalog
        } as Prisma.InputJsonObject
      }
    }),
    ...(preserveApprovedProfile
      ? []
      : [
          prisma.aiInteraction.updateMany({
            where: {
              workspaceId,
              agent: businessProfileAgentName,
              deletedAt: null,
              OR: [{ regenerated: null }, { regenerated: false }]
            },
            data: { regenerated: true }
          })
        ]),
    prisma.workspace.update({
      where: { id: workspaceId },
      data: { onboardingStatus: preserveApprovedProfile ? "COMPLETE" : "IN_PROGRESS", onboardingScore: vaultScore.score }
    })
  ]);

  return {
    analysis: await getAnalysisRecord(workspaceId, analysis.id),
    onboarding: await getOnboardingState(workspaceId)
  };
}

export async function discardOfferingDocumentAnalysis(workspaceId: string, analysisId: string): Promise<OfferingDocumentAnalysisRecord> {
  const analysis = await findAnalysis(workspaceId, analysisId);
  if (analysis.status === "PROCESSING") {
    throw new OfferingDocumentAnalysisConflictError("Wait for the current analysis to finish before discarding it");
  }
  if (analysis.status !== "READY" && analysis.status !== "FAILED") {
    throw new OfferingDocumentAnalysisConflictError("This document analysis is already closed");
  }

  await cleanupAnalysisFiles(workspaceId, analysis.id);
  await prisma.offeringDocumentAnalysis.update({
    where: { id: analysis.id },
    data: { status: "DISCARDED", discardedAt: new Date() }
  });
  return getAnalysisRecord(workspaceId, analysis.id);
}

export async function cleanupExpiredOfferingDocumentAnalyses(input: { now?: Date } = {}): Promise<OfferingDocumentCleanupResult> {
  const now = input.now ?? new Date();
  const expired = await prisma.offeringDocumentAnalysis.findMany({
    where: { status: { in: [...activeStatuses] }, expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" }
  });
  let removed = 0;
  let failed = 0;

  for (const analysis of expired) {
    try {
      await expireAnalysis(analysis, now);
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { expired: removed, failed };
}

export async function cleanupWorkspaceOfferingDocuments(workspaceId: string): Promise<void> {
  const analyses = await prisma.offeringDocumentAnalysis.findMany({ where: { workspaceId } });
  for (const analysis of analyses) {
    await cleanupAnalysisFiles(workspaceId, analysis.id);
  }
}

async function runOfferingDocumentAnalysis(workspaceId: string, analysisId: string): Promise<OfferingDocumentAnalysisRecord> {
  const files = await prisma.offeringDocumentFile.findMany({
    where: { workspaceId, analysisId, storageKey: { not: null } },
    orderBy: { createdAt: "asc" }
  });
  if (files.length === 0) throw new OfferingDocumentAnalysisConflictError("The temporary documents are no longer available");

  const usageDate = new Date();
  try {
    await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usageDate });
  } catch (error) {
    await markFailed(analysisId, failureCode(error));
    throw error;
  }

  await prisma.offeringDocumentAnalysis.update({
    where: { id: analysisId },
    data: { status: "PROCESSING", failureCode: null }
  });

  try {
    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const bytes = await readStoredMedia(workspaceId, file.storageKey!);
        return { filename: file.filename, mimeType: file.mimeType, base64Data: bytes.toString("base64") };
      })
    );
    const generated = await analyzeOfferingDocuments({ workspaceId, files: uploadedFiles });

    await prisma.$transaction(async (tx) => {
      const interaction = await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: analysisAgentName,
          promptVersion: generated.prompt_version,
          prompt: {
            workflow: "onboarding-offering-document",
            files: files.map((file) => ({
              id: file.id,
              filename: file.filename,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              checksumSha256: file.checksumSha256
            }))
          } as Prisma.InputJsonObject,
          response: { generatedExtraction: generated.extraction } as unknown as Prisma.InputJsonObject,
          accepted: false,
          edited: false,
          regenerated: false,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: localCurrency,
          model: generated.model
        }
      });
      await tx.offeringDocumentAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "READY",
          result: generated.extraction as unknown as Prisma.InputJsonObject,
          interactionId: interaction.id,
          failureCode: null
        }
      });
      await recordAiTokenUsage({
        client: tx,
        workspaceId,
        tokensIn: generated.tokens_in,
        tokensOut: generated.tokens_out,
        now: usageDate
      });
    });
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usageDate });
    await markFailed(analysisId, failureCode(error));
  }

  return getAnalysisRecord(workspaceId, analysisId);
}

async function expireAnalysis(analysis: OfferingDocumentAnalysis, now = new Date()): Promise<void> {
  await cleanupAnalysisFiles(analysis.workspaceId, analysis.id);
  await prisma.offeringDocumentAnalysis.update({
    where: { id: analysis.id },
    data: { status: "EXPIRED", discardedAt: now }
  });
}

async function cleanupAnalysisFiles(workspaceId: string, analysisId: string): Promise<void> {
  const files = await prisma.offeringDocumentFile.findMany({
    where: { workspaceId, analysisId, storageKey: { not: null } },
    orderBy: { createdAt: "asc" }
  });
  for (const file of files) {
    await deleteStoredMedia(workspaceId, file.storageKey!);
    await prisma.offeringDocumentFile.update({
      where: { id: file.id },
      data: { storageKey: null, removedAt: new Date() }
    });
  }
}

async function findAnalysis(workspaceId: string, analysisId: string): Promise<OfferingDocumentAnalysis> {
  const analysis = await prisma.offeringDocumentAnalysis.findFirst({ where: { id: analysisId, workspaceId } });
  if (analysis === null) throw new OfferingDocumentAnalysisNotFoundError("Document analysis was not found");
  return analysis;
}

async function getAnalysisRecord(workspaceId: string, analysisId: string): Promise<OfferingDocumentAnalysisRecord> {
  const analysis = await findAnalysis(workspaceId, analysisId);
  const files = await prisma.offeringDocumentFile.findMany({
    where: { workspaceId, analysisId },
    orderBy: { createdAt: "asc" }
  });
  return toRecord(analysis, files);
}

async function markFailed(analysisId: string, code: string): Promise<void> {
  await prisma.offeringDocumentAnalysis.update({
    where: { id: analysisId },
    data: { status: "FAILED", failureCode: code }
  });
}

function validateUploads(input: CreateOfferingDocumentAnalysisInput): ValidatedUpload[] {
  const uploads = input.files.map((file) => validateUpload(file));
  if (uploads.reduce((sum, file) => sum + file.bytes.byteLength, 0) > maxTotalBytes) {
    throw new OfferingDocumentInvalidError("The combined document size must be 12 MB or less");
  }
  return uploads;
}

function validateUpload(file: CreateOfferingDocumentAnalysisInput["files"][number]): ValidatedUpload {
  if (basename(file.filename) !== file.filename || /[\\/]/.test(file.filename)) {
    throw new OfferingDocumentInvalidError("Document filenames cannot contain paths");
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64Data)) {
    throw new OfferingDocumentInvalidError("The document encoding is invalid");
  }
  const bytes = Buffer.from(file.base64Data, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > maxFileBytes || bytes.toString("base64") !== file.base64Data) {
    throw new OfferingDocumentInvalidError("Each document must be no larger than 8 MB");
  }

  const extension = extname(file.filename).toLowerCase();
  const expectedExtension =
    file.mimeType === "application/pdf"
      ? ".pdf"
      : file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? ".docx"
        : ".txt";
  if (extension !== expectedExtension) throw new OfferingDocumentInvalidError("The document type and filename do not match");
  if (file.mimeType === "application/pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new OfferingDocumentInvalidError("The PDF signature is invalid");
  }
  if (file.mimeType.includes("wordprocessingml") && !bytes.subarray(0, 2).equals(Buffer.from("PK"))) {
    throw new OfferingDocumentInvalidError("The Word document signature is invalid");
  }
  if (file.mimeType === "text/plain") {
    if (bytes.includes(0)) throw new OfferingDocumentInvalidError("The text document contains binary data");
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new OfferingDocumentInvalidError("Text documents must use UTF-8 encoding");
    }
  }

  return {
    bytes,
    filename: file.filename,
    mimeType: file.mimeType,
    checksumSha256: createHash("sha256").update(bytes).digest("hex")
  };
}

function catalogForComparison(catalog: OfferingDocumentExtraction["catalog"] | OfferingCatalogInput) {
  return {
    summary: catalog.summary?.trim() || null,
    items: (catalog.items ?? []).map((item) => ({
      kind: item.kind ?? "UNSPECIFIED",
      name: item.name.trim(),
      category: item.category?.trim() || null,
      description: item.description?.trim() || null,
      priceMinor: item.priceMinor ?? null,
      currency: item.currency
    })),
    differentiators: catalog.differentiators ?? [],
    priceRange: catalog.priceRange?.trim() || null,
    salesChannels: catalog.salesChannels ?? []
  };
}

function failureCode(error: unknown): string {
  if (error instanceof AiServiceRequestError || error instanceof MediaStorageError) return error.code;
  const maybeCode = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (typeof maybeCode === "string" && /^[A-Z0-9_]{3,80}$/.test(maybeCode)) return maybeCode;
  return "OFFERING_DOCUMENT_ANALYSIS_FAILED";
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function toRecord(analysis: OfferingDocumentAnalysis, files: OfferingDocumentFile[]): OfferingDocumentAnalysisRecord {
  const result = offeringDocumentExtractionSchema.safeParse(analysis.result);
  return {
    id: analysis.id,
    workspaceId: analysis.workspaceId,
    status: analysis.status,
    files: files.map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      removed: file.storageKey === null
    })),
    ...(result.success ? { result: result.data as OfferingDocumentExtraction } : {}),
    ...(analysis.failureCode === null ? {} : { failureCode: analysis.failureCode }),
    expiresAt: analysis.expiresAt.toISOString(),
    ...(analysis.approvedAt === null ? {} : { approvedAt: analysis.approvedAt.toISOString() }),
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString()
  };
}

function readRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, Prisma.JsonValue>) : {};
}
