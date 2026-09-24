import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { sessionController } from "./auth/transport";
import { LocalAppError } from "./errors";

/** Share only an explicit user-requested export; always remove the temporary private copy. */
export async function shareFile(bytes: Uint8Array, filename: string, mimeType: string, epoch: number, title: string) {
  sessionController.assertEpoch(epoch);
  if (!(await Sharing.isAvailableAsync())) throw new LocalAppError("File sharing is unavailable on this device / مشاركة الملفات غير متاحة على هذا الجهاز");
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = new File(Paths.cache, `${Date.now()}-${safeName}`);
  try {
    sessionController.assertEpoch(epoch);
    file.create({ overwrite: true });
    file.write(bytes);
    sessionController.assertEpoch(epoch);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: title, UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : "public.json" });
  } finally {
    if (file.exists) file.delete();
  }
}
