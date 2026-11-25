import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { sessionController } from "../auth/transport";
import { LocalAppError } from "../errors";
import { newRequestId } from "../request-id";

function folder(scope: string) {
  return new Directory(Paths.document, "post-designs", encodeURIComponent(scope));
}

export function postDesignFile(scope: string, filename: string) {
  if (!/^[\da-f-]{36}\.(?:jpg|png|webp)$/i.test(filename)) throw new Error("Invalid post draft file");
  return new File(folder(scope), filename);
}

export async function pickPostPhoto(scope: string, epoch: number) {
  const result = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp"], copyToCacheDirectory: true });
  sessionController.assertEpoch(epoch);
  const selected = result.assets?.[0];
  if (!selected) return null;
  const source = new File(selected.uri);
  const extension = selected.name.split(".").at(-1)?.toLowerCase();
  if (!source.size || source.size > 8_000_000 || !extension || !["jpg", "jpeg", "png", "webp"].includes(extension))
    throw new LocalAppError("Choose a JPEG, PNG, or WebP under 8 MB. / اختر صورة JPEG أو PNG أو WebP أصغر من ٨ ميغابايت.");
  folder(scope).create({ intermediates: true, idempotent: true });
  const filename = `${newRequestId()}.${extension === "jpeg" ? "jpg" : extension}`;
  source.copy(postDesignFile(scope, filename));
  return filename;
}

export function savePostJpeg(scope: string, data: string) {
  folder(scope).create({ intermediates: true, idempotent: true });
  const filename = `${newRequestId()}.jpg`;
  const file = postDesignFile(scope, filename);
  file.create();
  file.write(data, { encoding: "base64" });
  return filename;
}

export function removePostFile(scope: string, filename?: string) {
  if (!filename) return;
  const file = postDesignFile(scope, filename);
  if (file.exists) file.delete();
}
