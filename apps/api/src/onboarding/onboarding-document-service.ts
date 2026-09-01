import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type { OnboardingDocumentAnalysis, OnboardingDocumentFile, Prisma } from "@prisma/client";
import type {
  ApproveOnboardingDocumentAnalysisResult,
  OnboardingDocumentAnalysisRecord,
  OnboardingDocumentExtraction,
  OfferingDocumentCleanupResult
} from "@markos/shared-types";
import type { ApproveOnboardingDocumentAnalysisInput, CreateOnboardingDocumentAnalysisInput } from "@markos/validation";
import { analyzeOnboardingDocuments, onboardingDocumentExtractionSchema } from "../ai/onboarding-document-client";
import { AiServiceRequestError } from "../ai/request";
import { prisma } from "../db/prisma";
import { deleteStoredMedia, MediaStorageError, readStoredMedia, storeWorkspaceMedia } from "../media/storage-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getOnboardingState, saveOnboardingModule } from "./onboarding-service";

const analysisAgentName = "ONBOARDING_DOCUMENT_ANALYST";
const analysisLifetimeMs = 24 * 60 * 60 * 1000;
const staleProcessingMs = 3 * 60 * 1000;
const maxFileBytes = 8_000_000;
const maxTotalBytes = 20_000_000;
const localCurrency = "BHD";
const activeStatuses = ["PROCESSING", "READY", "FAILED"] as const;

type ValidatedUpload = {
  bytes: Buffer;
  checksumSha256: string;
  filename: string;
  mimeType: string;
};

export class OnboardingDocumentInvalidError extends Error {}
export class OnboardingDocumentAnalysisNotFoundError extends Error {}
export class OnboardingDocumentAnalysisConflictError extends Error {}

export async function getActiveOnboardingDocumentAnalysis(workspaceId: string): Promise<OnboardingDocumentAnalysisRecord | null> {
  const analysis = await prisma.onboardingDocumentAnalysis.findFirst({
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
    await markFailed(analysis.id, "ONBOARDING_DOCUMENT_ANALYSIS_INTERRUPTED");
  }
  return getAnalysisRecord(workspaceId, analysis.id);
}

export async function createOnboardingDocumentAnalysis(
  workspaceId: string,
  input: CreateOnboardingDocumentAnalysisInput
): Promise<OnboardingDocumentAnalysisRecord> {
  const existing = await getActiveOnboardingDocumentAnalysis(workspaceId);
  if (existing !== null) {
    throw new OnboardingDocumentAnalysisConflictError("Review or discard the current document analysis before uploading another");
  }

  const uploads = validateUploads(input);
  let analysis: OnboardingDocumentAnalysis;
  try {
    analysis = await prisma.onboardingDocumentAnalysis.create({
      data: { workspaceId, expiresAt: new Date(Date.now() + analysisLifetimeMs) }
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new OnboardingDocumentAnalysisConflictError("Review or discard the current document analysis before uploading another");
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
      await prisma.onboardingDocumentFile.create({
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
    await prisma.onboardingDocumentAnalysis.update({
      where: { id: analysis.id },
      data: { status: "FAILED", failureCode: failureCode(error) }
    });
    throw error;
  }

  return runOnboardingDocumentAnalysis(workspaceId, analysis.id);
}

export async function retryOnboardingDocumentAnalysis(workspaceId: string, analysisId: string): Promise<OnboardingDocumentAnalysisRecord> {
  const analysis = await findAnalysis(workspaceId, analysisId);
  if (analysis.status !== "FAILED") throw new OnboardingDocumentAnalysisConflictError("Only a failed document analysis can be retried");
  if (analysis.expiresAt <= new Date()) {
    await expireAnalysis(analysis);
    throw new OnboardingDocumentAnalysisConflictError("This document analysis has expired");
  }
  return runOnboardingDocumentAnalysis(workspaceId, analysis.id);
}

export async function approveOnboardingDocumentAnalysis(
  workspaceId: string,
  analysisId: string,
  input: ApproveOnboardingDocumentAnalysisInput
): Promise<ApproveOnboardingDocumentAnalysisResult> {
  const analysis = await findAnalysis(workspaceId, analysisId);
  if (analysis.status !== "READY" || analysis.interactionId === null) {
    throw new OnboardingDocumentAnalysisConflictError("This document analysis is not ready for approval");
  }
  const generated = onboardingDocumentExtractionSchema.safeParse(analysis.result);
  if (!generated.success) throw new OnboardingDocumentAnalysisConflictError("The analysis result is unavailable");

  const profile = input.profile;
  await saveOnboardingModule(workspaceId, "company", profile.company);
  await saveOnboardingModule(workspaceId, "products", profile.offerings, {
    offeringSource: { sourceType: "DOCUMENT", sourceRef: analysis.id }
  });
  if (profile.story !== undefined) await saveOnboardingModule(workspaceId, "story", profile.story);
  if (profile.audience !== undefined) await saveOnboardingModule(workspaceId, "audience", profile.audience);
  if (profile.competitors !== undefined) await saveOnboardingModule(workspaceId, "competitors", profile.competitors);
  if (profile.brand !== undefined) await saveOnboardingModule(workspaceId, "brand", profile.brand);
  if (profile.objectives !== undefined) await saveOnboardingModule(workspaceId, "objectives", profile.objectives);

  const interaction = await prisma.aiInteraction.findFirstOrThrow({
    where: { id: analysis.interactionId, workspaceId, agent: analysisAgentName, deletedAt: null }
  });
  const interactionResponse = readRecord(interaction.response);
  const edited = JSON.stringify(generated.data.profile) !== JSON.stringify(profile);
  const approvedAt = new Date();

  await prisma.$transaction([
    prisma.onboardingDocumentAnalysis.update({
      where: { id: analysis.id },
      data: { status: "APPROVED", approvedAt, failureCode: null }
    }),
    prisma.aiInteraction.update({
      where: { id: interaction.id },
      data: {
        accepted: true,
        edited,
        response: { ...interactionResponse, approvedProfile: profile } as unknown as Prisma.InputJsonObject
      }
    })
  ]);
  await cleanupAnalysisFiles(workspaceId, analysis.id);

  return {
    analysis: await getAnalysisRecord(workspaceId, analysis.id),
    onboarding: await getOnboardingState(workspaceId)
  };
}

export async function discardOnboardingDocumentAnalysis(workspaceId: string, analysisId: string): Promise<OnboardingDocumentAnalysisRecord> {
  const analysis = await findAnalysis(workspaceId, analysisId);
  if (analysis.status === "PROCESSING") throw new OnboardingDocumentAnalysisConflictError("Wait for the current analysis to finish before discarding it");
  if (analysis.status !== "READY" && analysis.status !== "FAILED") {
    throw new OnboardingDocumentAnalysisConflictError("This document analysis is already closed");
  }
  await cleanupAnalysisFiles(workspaceId, analysis.id);
  await prisma.onboardingDocumentAnalysis.update({
    where: { id: analysis.id },
    data: { status: "DISCARDED", discardedAt: new Date() }
  });
  return getAnalysisRecord(workspaceId, analysis.id);
}

export async function cleanupExpiredOnboardingDocumentAnalyses(input: { now?: Date } = {}): Promise<OfferingDocumentCleanupResult> {
  const now = input.now ?? new Date();
  const expired = await prisma.onboardingDocumentAnalysis.findMany({
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

export async function cleanupWorkspaceOnboardingDocuments(workspaceId: string): Promise<void> {
  const analyses = await prisma.onboardingDocumentAnalysis.findMany({ where: { workspaceId } });
  for (const analysis of analyses) await cleanupAnalysisFiles(workspaceId, analysis.id);
}

async function runOnboardingDocumentAnalysis(workspaceId: string, analysisId: string): Promise<OnboardingDocumentAnalysisRecord> {
  const files = await prisma.onboardingDocumentFile.findMany({
    where: { workspaceId, analysisId, storageKey: { not: null } },
    orderBy: { createdAt: "asc" }
  });
  if (files.length === 0) throw new OnboardingDocumentAnalysisConflictError("The temporary documents are no longer available");

  const usageDate = new Date();
  try {
    await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usageDate });
  } catch (error) {
    await markFailed(analysisId, failureCode(error));
    throw error;
  }
  await prisma.onboardingDocumentAnalysis.update({ where: { id: analysisId }, data: { status: "PROCESSING", failureCode: null } });

  try {
    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const bytes = await readStoredMedia(workspaceId, file.storageKey!);
        return { filename: file.filename, mimeType: file.mimeType, base64Data: bytes.toString("base64") };
      })
    );
    const generated = await analyzeOnboardingDocuments({ workspaceId, files: uploadedFiles });

    await prisma.$transaction(async (tx) => {
      const interaction = await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: analysisAgentName,
          promptVersion: generated.prompt_version,
          prompt: {
            workflow: "onboarding-business-documents",
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
      await tx.onboardingDocumentAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "READY",
          result: generated.extraction as unknown as Prisma.InputJsonObject,
          interactionId: interaction.id,
          failureCode: null
        }
      });
      await recordAiTokenUsage({ client: tx, workspaceId, tokensIn: generated.tokens_in, tokensOut: generated.tokens_out, now: usageDate });
    });
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usageDate });
    await markFailed(analysisId, failureCode(error));
  }
  return getAnalysisRecord(workspaceId, analysisId);
}

async function expireAnalysis(analysis: OnboardingDocumentAnalysis, now = new Date()): Promise<void> {
  await cleanupAnalysisFiles(analysis.workspaceId, analysis.id);
  await prisma.onboardingDocumentAnalysis.update({ where: { id: analysis.id }, data: { status: "EXPIRED", discardedAt: now } });
}

async function cleanupAnalysisFiles(workspaceId: string, analysisId: string): Promise<void> {
  const files = await prisma.onboardingDocumentFile.findMany({ where: { workspaceId, analysisId, storageKey: { not: null } } });
  for (const file of files) {
    await deleteStoredMedia(workspaceId, file.storageKey!);
    await prisma.onboardingDocumentFile.update({ where: { id: file.id }, data: { storageKey: null, removedAt: new Date() } });
  }
}

async function findAnalysis(workspaceId: string, analysisId: string): Promise<OnboardingDocumentAnalysis> {
  const analysis = await prisma.onboardingDocumentAnalysis.findFirst({ where: { id: analysisId, workspaceId } });
  if (analysis === null) throw new OnboardingDocumentAnalysisNotFoundError("Document analysis was not found");
  return analysis;
}

async function getAnalysisRecord(workspaceId: string, analysisId: string): Promise<OnboardingDocumentAnalysisRecord> {
  const analysis = await findAnalysis(workspaceId, analysisId);
  const files = await prisma.onboardingDocumentFile.findMany({ where: { workspaceId, analysisId }, orderBy: { createdAt: "asc" } });
  return toRecord(analysis, files);
}

async function markFailed(analysisId: string, code: string): Promise<void> {
  await prisma.onboardingDocumentAnalysis.update({ where: { id: analysisId }, data: { status: "FAILED", failureCode: code } });
}

function validateUploads(input: CreateOnboardingDocumentAnalysisInput): ValidatedUpload[] {
  const uploads = input.files.map(validateUpload);
  if (uploads.reduce((sum, file) => sum + file.bytes.byteLength, 0) > maxTotalBytes) {
    throw new OnboardingDocumentInvalidError("The combined file size must be 20 MB or less");
  }
  return uploads;
}

function validateUpload(file: CreateOnboardingDocumentAnalysisInput["files"][number]): ValidatedUpload {
  if (basename(file.filename) !== file.filename || /[\\/]/.test(file.filename)) throw new OnboardingDocumentInvalidError("Filenames cannot contain paths");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64Data)) {
    throw new OnboardingDocumentInvalidError("The file encoding is invalid");
  }
  const bytes = Buffer.from(file.base64Data, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > maxFileBytes || bytes.toString("base64") !== file.base64Data) {
    throw new OnboardingDocumentInvalidError("Each file must be no larger than 8 MB");
  }

  const extension = extname(file.filename).toLowerCase();
  const expectedExtensions: Record<string, string[]> = {
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "text/plain": [".txt"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"]
  };
  if (!expectedExtensions[file.mimeType]?.includes(extension)) throw new OnboardingDocumentInvalidError("The file type and filename do not match");
  if (file.mimeType === "application/pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new OnboardingDocumentInvalidError("The PDF signature is invalid");
  if (file.mimeType.includes("wordprocessingml") && !bytes.subarray(0, 2).equals(Buffer.from("PK")))
    throw new OnboardingDocumentInvalidError("The Word document signature is invalid");
  if (file.mimeType === "image/jpeg" && !bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    throw new OnboardingDocumentInvalidError("The JPEG signature is invalid");
  if (file.mimeType === "image/png" && !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new OnboardingDocumentInvalidError("The PNG signature is invalid");
  }
  if (file.mimeType === "image/webp" && !(bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) {
    throw new OnboardingDocumentInvalidError("The WebP signature is invalid");
  }
  if (file.mimeType === "text/plain") {
    if (bytes.includes(0)) throw new OnboardingDocumentInvalidError("The text document contains binary data");
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new OnboardingDocumentInvalidError("Text documents must use UTF-8 encoding");
    }
  }

  return { bytes, filename: file.filename, mimeType: file.mimeType, checksumSha256: createHash("sha256").update(bytes).digest("hex") };
}

function failureCode(error: unknown): string {
  if (error instanceof AiServiceRequestError || error instanceof MediaStorageError) return error.code;
  const maybeCode = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (typeof maybeCode === "string" && /^[A-Z0-9_]{3,80}$/.test(maybeCode)) return maybeCode;
  return "ONBOARDING_DOCUMENT_ANALYSIS_FAILED";
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function toRecord(analysis: OnboardingDocumentAnalysis, files: OnboardingDocumentFile[]): OnboardingDocumentAnalysisRecord {
  const result = onboardingDocumentExtractionSchema.safeParse(analysis.result);
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
    ...(result.success ? { result: result.data as OnboardingDocumentExtraction } : {}),
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
