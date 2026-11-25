import type { PostArtwork, PostFont, PostRatio, PostStyle } from "@markos/shared-types";

export type DesktopPostDesign = {
  stage: "ideas" | "style" | "font" | "ratio" | "preview";
  photo?: Blob;
  photoName?: string;
  generatedPhoto?: string;
  preview?: Blob;
  attachedId?: string | null;
  template?: string;
  style?: PostStyle;
  font?: PostFont;
  ratio?: PostRatio;
  artwork?: PostArtwork;
};

function designs<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("markos-post-designs", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("designs");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("designs", mode);
      const request = action(transaction.objectStore("designs"));
      transaction.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

export const readPostDesign = (key: string) => designs<DesktopPostDesign | undefined>("readonly", (store) => store.get(key));
export const savePostDesign = (key: string, design: DesktopPostDesign) => designs("readwrite", (store) => store.put(design, key));
export const clearPostDesigns = (userId: string) => designs("readwrite", (store) => store.delete(IDBKeyRange.bound(`${userId}:`, `${userId}:\uffff`)));

export function readPostPhoto(photo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(photo);
  });
}

export const postJpeg = (data: string) => new Blob([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], { type: "image/jpeg" });
