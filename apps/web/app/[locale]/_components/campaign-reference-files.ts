import { campaignReferenceLimits, type CampaignReferenceFileInput } from "@markos/shared-types";

const mimeTypes: Record<string, CampaignReferenceFileInput["mimeType"]> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp"
};
export const campaignReferenceAccept = ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp";
export function addCampaignReferenceFiles(current: File[], added: File[]): File[] {
  const next = [...current];
  for (const file of added) {
    if (!next.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) next.push(file);
  }
  if (next.length > campaignReferenceLimits.files) throw new Error("filesTooMany");
  for (const file of next) {
    if (!mimeTypes[file.name.split(".").at(-1)?.toLowerCase() ?? ""] || file.name.length > 180) throw new Error("filesUnsupported");
    if (file.size === 0 || file.size > campaignReferenceLimits.fileBytes) throw new Error("fileTooLarge");
  }
  if (next.reduce((sum, file) => sum + file.size, 0) > campaignReferenceLimits.totalBytes) throw new Error("filesTotalTooLarge");
  return next;
}

export async function campaignReferencePayload(files: File[]): Promise<CampaignReferenceFileInput[]> {
  addCampaignReferenceFiles([], files);
  return Promise.all(files.map(async file => ({
    filename: file.name,
    mimeType: mimeTypes[file.name.split(".").at(-1)!.toLowerCase()]!,
    base64Data: await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string" || !reader.result.includes(",")) return reject(new Error("fileReadFailed"));
        resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      };
      reader.onerror = reader.onabort = () => reject(new Error("fileReadFailed"));
      reader.readAsDataURL(file);
    })
  })));
}
