import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const digits = 6;
const periodSeconds = 30;
const windowSteps = 1;

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function buildTotpUri(input: { accountName: string; issuer: string; secret: string }): string {
  const label = `${input.issuer}:${input.accountName}`;
  const params = new URLSearchParams({
    algorithm: "SHA1",
    digits: String(digits),
    issuer: input.issuer,
    period: String(periodSeconds),
    secret: input.secret
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function generateTotpCode(secret: string, now = new Date()): string {
  return hotp(decodeBase32(secret), timeCounter(now));
}

export function verifyTotpCode(secret: string, code: string, now = new Date()): boolean {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const key = decodeBase32(secret);
  const counter = timeCounter(now);

  for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
    const candidate = hotp(key, counter + offset);
    const candidateBuffer = Buffer.from(candidate);
    const codeBuffer = Buffer.from(code);

    if (candidateBuffer.length === codeBuffer.length && timingSafeEqual(candidateBuffer, codeBuffer)) {
      return true;
    }
  }

  return false;
}

function timeCounter(now: Date): number {
  return Math.floor(now.getTime() / 1000 / periodSeconds);
}

function hotp(key: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(secret: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of secret.replace(/=+$/u, "").toUpperCase()) {
    const index = alphabet.indexOf(char);

    if (index === -1) {
      throw new Error("Invalid TOTP secret");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
