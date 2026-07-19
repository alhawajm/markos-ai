import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { Prisma } from "@prisma/client";
import type { VaultSection, VaultWebsiteIngestCandidate, VaultWebsiteIngestDraft } from "@markos/shared-types";
import {
  vaultWebsiteIngestCandidateSchema,
  type VaultWebsiteIngestApproveInput,
  type VaultWebsiteIngestCandidateInput,
  type VaultWebsiteIngestPreviewInput,
  type VaultWebsiteIngestRejectInput
} from "@markos/validation";
import { prisma } from "../db/prisma";
import { upsertVaultSection } from "./vault-service";

const maxWebsiteBytes = 1_000_000;
const websiteFetchTimeoutMs = 5_000;
const userAgent = "MARKOS-AI-Vault-Ingest/1.0 (+https://markos.ai)";

interface WebsiteSignals {
  colors: string[];
  description?: string;
  headline?: string;
  imageAlts: string[];
  links: string[];
  paragraphs: string[];
  siteName?: string;
  title?: string;
  url: string;
}

export class VaultWebsiteIngestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export function extractWebsiteIngestCandidates(
  url: string,
  html: string,
  extractedAt = new Date()
): VaultWebsiteIngestCandidate[] {
  return buildCandidates(extractWebsiteSignals(url, html), extractedAt);
}

export async function previewWebsiteIngest(
  workspaceId: string,
  actorId: string,
  input: VaultWebsiteIngestPreviewInput
): Promise<VaultWebsiteIngestDraft> {
  const url = normalizeAndValidateWebsiteUrl(input.url);
  const html = await fetchWebsiteHtml(url);
  const signals = extractWebsiteSignals(url, html);
  const candidates = buildCandidates(signals, new Date());

  if (candidates.length === 0) {
    throw new VaultWebsiteIngestError(
      "WEBSITE_INGEST_NO_SIGNALS",
      "The website did not expose enough public brand signals to create a Vault preview",
      422
    );
  }

  const draft = await prisma.vaultIngestDraft.create({
    data: {
      workspaceId,
      sourceUrl: url,
      ...(signals.title === undefined ? {} : { sourceTitle: signals.title }),
      ...(signals.description === undefined ? {} : { sourceDescription: signals.description }),
      candidates: candidates as unknown as Prisma.InputJsonValue,
      confidence: averageConfidence(candidates),
      status: "PENDING"
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      workspaceId,
      action: "VAULT_WEBSITE_INGEST_PREVIEWED",
      targetType: "VaultIngestDraft",
      targetId: draft.id,
      metadata: {
        sourceUrl: url,
        candidateCount: candidates.length,
        sections: Array.from(new Set(candidates.map((candidate) => candidate.section)))
      }
    }
  });

  return toDraftRecord(draft);
}

export async function approveWebsiteIngest(
  workspaceId: string,
  actorId: string,
  draftId: string,
  input: VaultWebsiteIngestApproveInput
): Promise<VaultWebsiteIngestDraft> {
  const draft = await findPendingDraft(workspaceId, draftId);
  const candidates = normalizeCandidates(input.candidates ?? parseDraftCandidates(draft.candidates));

  for (const candidate of candidates) {
    const parsed = vaultWebsiteIngestCandidateSchema.safeParse(candidate);

    if (!parsed.success) {
      throw new VaultWebsiteIngestError("WEBSITE_INGEST_CANDIDATE_INVALID", "Invalid ingest candidate payload", 400);
    }
  }

  for (const section of unique(candidates.map((candidate) => candidate.section))) {
    await upsertVaultSection(workspaceId, section, {
      entries: candidates
        .filter((candidate) => candidate.section === section)
        .map((candidate) => ({
          key: candidate.key,
          value: candidate.value
        }))
    });
  }

  const reviewedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.vaultIngestDraft.update({
      where: {
        id: draft.id
      },
      data: {
        candidates: candidates as unknown as Prisma.InputJsonValue,
        confidence: averageConfidence(candidates),
        reviewedAt,
        status: "APPROVED"
      }
    });

    await tx.auditLog.create({
      data: {
        actorId,
        workspaceId,
        action: "VAULT_WEBSITE_INGEST_APPROVED",
        targetType: "VaultIngestDraft",
        targetId: draft.id,
        metadata: {
          sourceUrl: draft.sourceUrl,
          candidateCount: candidates.length,
          sections: unique(candidates.map((candidate) => candidate.section))
        }
      }
    });

    return row;
  });

  return toDraftRecord(updated);
}

export async function rejectWebsiteIngest(
  workspaceId: string,
  actorId: string,
  draftId: string,
  input: VaultWebsiteIngestRejectInput
): Promise<VaultWebsiteIngestDraft> {
  const draft = await findPendingDraft(workspaceId, draftId);
  const reviewedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.vaultIngestDraft.update({
      where: {
        id: draft.id
      },
      data: {
        error: input.reason ?? null,
        reviewedAt,
        status: "REJECTED"
      }
    });

    await tx.auditLog.create({
      data: {
        actorId,
        workspaceId,
        action: "VAULT_WEBSITE_INGEST_REJECTED",
        targetType: "VaultIngestDraft",
        targetId: draft.id,
        metadata: {
          sourceUrl: draft.sourceUrl,
          reason: input.reason ?? "not provided"
        }
      }
    });

    return row;
  });

  return toDraftRecord(updated);
}

async function findPendingDraft(workspaceId: string, draftId: string) {
  const draft = await prisma.vaultIngestDraft.findFirst({
    where: {
      id: draftId,
      workspaceId,
      deletedAt: null
    }
  });

  if (draft === null) {
    throw new VaultWebsiteIngestError("WEBSITE_INGEST_DRAFT_NOT_FOUND", "Website ingest draft was not found", 404);
  }

  if (draft.status !== "PENDING") {
    throw new VaultWebsiteIngestError("WEBSITE_INGEST_DRAFT_LOCKED", "Website ingest draft has already been reviewed", 409);
  }

  return draft;
}

function normalizeAndValidateWebsiteUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const protocol = url.protocol.toLowerCase();

  if (protocol !== "https:" && protocol !== "http:") {
    throw new VaultWebsiteIngestError("WEBSITE_INGEST_URL_BLOCKED", "Website URL must use HTTP or HTTPS", 400);
  }

  url.hash = "";

  const hostname = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  if (
    hostname.length === 0 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isBlockedIp(hostname)
  ) {
    throw new VaultWebsiteIngestError("WEBSITE_INGEST_URL_BLOCKED", "Website URL must point to a public website", 400);
  }

  return url.toString();
}

async function fetchWebsiteHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), websiteFetchTimeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": userAgent
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new VaultWebsiteIngestError("WEBSITE_INGEST_FETCH_FAILED", `Website returned HTTP ${response.status}`, 422);
    }

    const finalUrl = response.url.length > 0 ? response.url : url;
    normalizeAndValidateWebsiteUrl(finalUrl);

    const contentType = response.headers.get("content-type")?.toLowerCase();

    if (contentType !== undefined && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new VaultWebsiteIngestError("WEBSITE_INGEST_UNSUPPORTED_CONTENT", "Website did not return HTML content", 415);
    }

    const bytes = await response.arrayBuffer();

    if (bytes.byteLength > maxWebsiteBytes) {
      throw new VaultWebsiteIngestError("WEBSITE_INGEST_TOO_LARGE", "Website HTML is too large to ingest safely", 413);
    }

    return new TextDecoder("utf-8").decode(bytes);
  } catch (error) {
    if (error instanceof VaultWebsiteIngestError) {
      throw error;
    }

    throw new VaultWebsiteIngestError("WEBSITE_INGEST_FETCH_FAILED", "Could not fetch website for ingest", 422);
  } finally {
    clearTimeout(timeout);
  }
}

function extractWebsiteSignals(url: string, html: string): WebsiteSignals {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg").remove();

  const title = cleanText($("title").first().text());
  const description = cleanText(
    $("meta[name='description']").attr("content") ??
      $("meta[property='og:description']").attr("content") ??
      $("meta[name='twitter:description']").attr("content")
  );
  const siteName = cleanText($("meta[property='og:site_name']").attr("content"));
  const headline = cleanText($("h1").first().text());
  const paragraphs = unique(
    $("p")
      .toArray()
      .map((element) => cleanText($(element).text()))
      .filter(isUsefulText)
  ).slice(0, 12);
  const links = unique(
    $("a")
      .toArray()
      .map((element) => cleanText($(element).text()))
      .filter(isUsefulText)
  ).slice(0, 30);
  const imageAlts = unique(
    $("img")
      .toArray()
      .map((element) => cleanText($(element).attr("alt")))
      .filter(isUsefulText)
  ).slice(0, 20);
  const colors = unique((html.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((color) => color.toUpperCase())).slice(0, 12);

  return {
    url,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(siteName === undefined ? {} : { siteName }),
    ...(headline === undefined ? {} : { headline }),
    paragraphs,
    links,
    imageAlts,
    colors
  };
}

function buildCandidates(signals: WebsiteSignals, extractedAt: Date): VaultWebsiteIngestCandidate[] {
  const extractedAtIso = extractedAt.toISOString();
  const name = deriveBusinessName(signals);
  const mainSummary = signals.description ?? signals.headline ?? signals.paragraphs[0];
  const baseSource = {
    type: "website_ingest",
    sourceUrl: signals.url,
    extractedAt: extractedAtIso,
    extractionMethod: "dom_signals_v1"
  };
  const candidates: VaultWebsiteIngestCandidate[] = [];

  if (name !== undefined || mainSummary !== undefined) {
    candidates.push({
      section: "COMPANY",
      key: "website-profile",
      confidence: sectionConfidence(signals, "COMPANY"),
      sourceUrl: signals.url,
      extractedAt: extractedAtIso,
      ...(mainSummary === undefined ? {} : { sourceSnippet: truncate(mainSummary, 320) }),
      value: {
        source: baseSource,
        ...(name === undefined ? {} : { name }),
        ...(signals.headline === undefined ? {} : { headline: signals.headline }),
        ...(signals.description === undefined ? {} : { description: signals.description }),
        languages: inferLanguages(signals)
      }
    });
  }

  if (signals.paragraphs.length > 0 || signals.headline !== undefined) {
    candidates.push({
      section: "STORY",
      key: "website-story",
      confidence: sectionConfidence(signals, "STORY"),
      sourceUrl: signals.url,
      extractedAt: extractedAtIso,
      sourceSnippet: truncate(signals.paragraphs[0] ?? signals.headline ?? "", 320),
      value: {
        source: baseSource,
        summary: truncate([signals.headline, signals.description, ...signals.paragraphs].filter(Boolean).join(" "), 1200),
        proofPoints: signals.paragraphs.slice(0, 5)
      }
    });
  }

  const productSignals = inferProductSignals(signals);

  if (productSignals.length > 0) {
    candidates.push({
      section: "PRODUCTS",
      key: "website-products",
      confidence: sectionConfidence(signals, "PRODUCTS"),
      sourceUrl: signals.url,
      extractedAt: extractedAtIso,
      sourceSnippet: truncate(productSignals.map((item) => item.name).join(", "), 320),
      value: {
        source: baseSource,
        discoveredItems: productSignals
      }
    });
  }

  if (signals.colors.length > 0 || signals.imageAlts.length > 0) {
    candidates.push({
      section: "BRAND",
      key: "website-visual-signals",
      confidence: sectionConfidence(signals, "BRAND"),
      sourceUrl: signals.url,
      extractedAt: extractedAtIso,
      sourceSnippet: truncate([...signals.imageAlts, ...signals.colors].join(", "), 320),
      value: {
        source: baseSource,
        colors: signals.colors,
        visualReferences: signals.imageAlts,
        note: "Website imagery is treated as brand reference until reuse rights are confirmed."
      }
    });
  }

  const toneWords = inferToneWords(signals);

  if (toneWords.length > 0) {
    candidates.push({
      section: "TONE",
      key: "website-voice",
      confidence: sectionConfidence(signals, "TONE"),
      sourceUrl: signals.url,
      extractedAt: extractedAtIso,
      sourceSnippet: truncate([signals.description, signals.paragraphs[0]].filter(Boolean).join(" "), 320),
      value: {
        source: baseSource,
        toneWords,
        voiceEvidence: signals.paragraphs.slice(0, 4)
      }
    });
  }

  return candidates;
}

function deriveBusinessName(signals: WebsiteSignals): string | undefined {
  const source = signals.siteName ?? signals.title;

  if (source === undefined) {
    return undefined;
  }

  return cleanText(source.split(/\s[|:-]\s/)[0]);
}

function inferProductSignals(signals: WebsiteSignals): Array<{ name: string; evidence: string }> {
  const keywords = [
    "service",
    "services",
    "product",
    "products",
    "shop",
    "pricing",
    "package",
    "packages",
    "collection",
    "collections",
    "menu",
    "offer",
    "offers",
    "plan",
    "plans",
    "booking"
  ];
  const signalsToScan = unique([signals.headline, ...signals.links, ...signals.paragraphs].filter(Boolean) as string[]);

  return signalsToScan
    .filter((text) => keywords.some((keyword) => text.toLowerCase().includes(keyword)))
    .slice(0, 8)
    .map((text) => ({
      name: truncate(text, 120),
      evidence: truncate(text, 300)
    }));
}

function inferToneWords(signals: WebsiteSignals): string[] {
  const text = [signals.title, signals.description, signals.headline, ...signals.paragraphs].filter(Boolean).join(" ").toLowerCase();
  const toneRules: Array<[string, string[]]> = [
    ["premium", ["premium", "luxury", "exclusive", "elegant"]],
    ["warm", ["family", "community", "care", "welcome", "hospitality"]],
    ["innovative", ["technology", "digital", "innovation", "smart", "ai"]],
    ["trusted", ["trusted", "certified", "expert", "quality", "reliable"]],
    ["sustainable", ["sustainable", "eco", "ethical", "recycled"]],
    ["value-focused", ["affordable", "value", "save", "offer"]]
  ];
  const matches = toneRules.filter(([, words]) => words.some((word) => text.includes(word))).map(([tone]) => tone);

  return matches.slice(0, 6);
}

function inferLanguages(signals: WebsiteSignals): string[] {
  const text = [signals.title, signals.description, signals.headline, ...signals.paragraphs].filter(Boolean).join(" ");
  const languages: string[] = [];

  if (/[\u0600-\u06ff]/.test(text)) {
    languages.push("Arabic");
  }

  if (/[a-z]/i.test(text)) {
    languages.push("English");
  }

  return languages.length === 0 ? ["Unknown"] : languages;
}

function sectionConfidence(signals: WebsiteSignals, section: VaultSection): number {
  const base =
    0.35 +
    signals.paragraphs.length * 0.025 +
    signals.links.length * 0.005 +
    signals.imageAlts.length * 0.01 +
    signals.colors.length * 0.01 +
    (signals.description === undefined ? 0 : 0.12) +
    (signals.headline === undefined ? 0 : 0.08);
  const multiplier: Record<VaultSection, number> = {
    AUDIENCE: 0.8,
    BRAND: 0.95,
    COMPANY: 1,
    COMPETITORS: 0.7,
    OBJECTIVES: 0.7,
    PRODUCTS: 0.9,
    STORY: 0.95,
    TONE: 0.85
  };

  return roundConfidence(Math.min(0.9, base * multiplier[section]));
}

function averageConfidence(candidates: VaultWebsiteIngestCandidate[]): number {
  return roundConfidence(candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / candidates.length);
}

function parseDraftCandidates(value: Prisma.JsonValue): VaultWebsiteIngestCandidate[] {
  const parsed = vaultWebsiteIngestCandidateSchema.array().safeParse(value);

  if (!parsed.success) {
    throw new VaultWebsiteIngestError("WEBSITE_INGEST_DRAFT_INVALID", "Stored ingest draft candidates are invalid", 500);
  }

  return normalizeCandidates(parsed.data);
}

function normalizeCandidates(candidates: VaultWebsiteIngestCandidateInput[]): VaultWebsiteIngestCandidate[] {
  return candidates.map((candidate) => ({
    section: candidate.section,
    key: candidate.key,
    value: candidate.value,
    confidence: candidate.confidence,
    sourceUrl: candidate.sourceUrl,
    extractedAt: candidate.extractedAt,
    ...(candidate.sourceSnippet === undefined ? {} : { sourceSnippet: candidate.sourceSnippet })
  }));
}

function toDraftRecord(draft: {
  candidates: Prisma.JsonValue;
  confidence: number;
  createdAt: Date;
  deletedAt?: Date | null;
  error: string | null;
  id: string;
  reviewedAt: Date | null;
  sourceDescription: string | null;
  sourceTitle: string | null;
  sourceUrl: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  updatedAt: Date;
  workspaceId: string;
}): VaultWebsiteIngestDraft {
  const candidates = parseDraftCandidates(draft.candidates);

  return {
    id: draft.id,
    workspaceId: draft.workspaceId,
    sourceUrl: draft.sourceUrl,
    ...(draft.sourceTitle === null ? {} : { sourceTitle: draft.sourceTitle }),
    ...(draft.sourceDescription === null ? {} : { sourceDescription: draft.sourceDescription }),
    candidates,
    status: draft.status,
    confidence: draft.confidence,
    ...(draft.error === null ? {} : { error: draft.error }),
    ...(draft.reviewedAt === null ? {} : { reviewedAt: draft.reviewedAt.toISOString() }),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString()
  };
}

function isBlockedIp(hostname: string): boolean {
  const ipVersion = isIP(hostname);

  if (ipVersion === 0) {
    return false;
  }

  if (ipVersion === 6) {
    const normalized = hostname.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }

  const [a = 0, b = 0] = hostname.split(".").map((part) => Number(part));

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function cleanText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function isUsefulText(value: string | undefined): value is string {
  return value !== undefined && value.length >= 3;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
