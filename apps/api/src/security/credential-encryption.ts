import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

export class CredentialEncryptionError extends Error {
  constructor() {
    super("Credential could not be processed");
  }
}

export function decodeEncryptionKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey)
    throw new CredentialEncryptionError();
  return key;
}

export function encryptCredential(
  plaintext: string,
  encodedKey: string,
): string {
  if (!plaintext) throw new CredentialEncryptionError();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, decodeEncryptionKey(encodedKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptCredential(
  envelope: string,
  encodedKey: string,
): string {
  try {
    const [version, iv, tag, ciphertext, extra] = envelope.split(".");
    if (version !== VERSION || !iv || !tag || !ciphertext || extra)
      throw new Error();
    const ivBytes = decodeBase64Url(iv);
    const tagBytes = decodeBase64Url(tag);
    const ciphertextBytes = decodeBase64Url(ciphertext);
    if (ivBytes.length !== 12 || tagBytes.length !== 16) throw new Error();
    const decipher = createDecipheriv(
      ALGORITHM,
      decodeEncryptionKey(encodedKey),
      ivBytes,
    );
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([
      decipher.update(ciphertextBytes),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new CredentialEncryptionError();
  }
}

function decodeBase64Url(value: string): Buffer {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error();
  return decoded;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) =>
      /(?:access[_-]?token|app[_-]?secret|encryption[_-]?key|state[_-]?secret)/i.test(
        key,
      )
        ? [key, "[REDACTED]"]
        : [key, redactSecrets(item)],
    ),
  );
}
