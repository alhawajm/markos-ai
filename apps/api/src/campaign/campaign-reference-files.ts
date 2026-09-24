import { createHash } from "node:crypto";
import { extname } from "node:path";
import { campaignReferenceLimits, type CampaignReferenceFileInput, type CampaignPlan } from "@markos/shared-types";

export const maxCampaignReferenceBodyBytes = 28_000_000;
export class CampaignReferenceFileError extends Error {}

const extensions: Record<CampaignReferenceFileInput["mimeType"], string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"], "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"]
};

export function validateCampaignReferences(files: CampaignReferenceFileInput[]): NonNullable<CampaignPlan["referenceFiles"]> {
  if (files.length > campaignReferenceLimits.files) throw new CampaignReferenceFileError("Choose up to 5 campaign reference files");
  let total = 0;
  return files.map(file => {
    if (/[\\/\x00-\x1f]/.test(file.filename) || !extensions[file.mimeType]?.includes(extname(file.filename).toLowerCase())) {
      throw new CampaignReferenceFileError("Use PDF, Word (.docx), TXT, PNG, JPG or WebP files with matching filenames");
    }
    const bytes = Buffer.from(file.base64Data, "base64");
    if (!bytes.length || bytes.length > campaignReferenceLimits.fileBytes || bytes.toString("base64") !== file.base64Data) {
      throw new CampaignReferenceFileError("Each reference file must be valid and no larger than 8 MB");
    }
    total += bytes.length;
    if (total > campaignReferenceLimits.totalBytes) throw new CampaignReferenceFileError("The combined reference files must be 20 MB or less");
    const signatures: Partial<Record<CampaignReferenceFileInput["mimeType"], number[]>> = {
      "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [0x50, 0x4b],
      "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]
    };
    const signature = signatures[file.mimeType];
    if (signature && !bytes.subarray(0, signature.length).equals(Buffer.from(signature))) throw new CampaignReferenceFileError(`The file ${file.filename} does not match its type`);
    if (file.mimeType === "image/webp" && (bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP")) {
      throw new CampaignReferenceFileError("The WebP file is invalid");
    }
    if (file.mimeType === "text/plain") {
      try {
        if (bytes.includes(0)) throw new Error("binary");
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch { throw new CampaignReferenceFileError("TXT files must contain UTF-8 text"); }
    }
    return { filename: file.filename, mimeType: file.mimeType, sizeBytes: bytes.length, checksumSha256: createHash("sha256").update(bytes).digest("hex") };
  });
}
