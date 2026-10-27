import { constants, createHash, generateKeyPairSync, privateEncrypt, sign } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const mobile = createRequire(new URL("../../mobile/package.json", import.meta.url));
const expo = createRequire(mobile.resolve("expo/package.json"));
const cli = createRequire(expo.resolve("@expo/cli"));
const forge = cli("node-forge") as {
  asn1: {
    Class: { UNIVERSAL: number };
    Type: { SEQUENCE: number; OID: number; NULL: number; OCTETSTRING: number };
    create: (c: number, t: number, constructed: boolean, value: unknown) => unknown;
    toDer: (value: unknown) => { getBytes: () => string };
    oidToDer: (value: string) => { getBytes: () => string };
  };
  pki: { publicKeyFromPem: (value: string) => { verify: (digest: string, signature: string) => boolean } };
};
type Result = { success: boolean; error?: { issues: unknown[] } };
type Schema = { array: () => Schema; safeParse: (value: unknown) => Result };
const z = cli("zod") as { number: () => Schema; string: () => Schema; union: (values: Schema[]) => Schema };
const routerPackage = createRequire(mobile.resolve("expo-router/package.json"));
const queryString = createRequire(routerPackage.resolve("query-string"));
const decode = queryString("decode-uri-component") as (value: string) => string;

describe("Expo toolchain security backports", () => {
  it("rejects nested DigestAlgorithm garbage while retaining valid RSA signatures", () => {
    const keys = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      publicExponent: 65537,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    const key = forge.pki.publicKeyFromPem(keys.publicKey),
      message = Buffer.from("MARKOS signing verification");
    const digest = createHash("sha256").update(message).digest();
    expect(key.verify(digest.toString("binary"), sign("sha256", message, keys.privateKey).toString("binary"))).toBe(true);
    const a = forge.asn1,
      c = a.Class.UNIVERSAL,
      t = a.Type;
    const der = Buffer.from(
      a
        .toDer(
          a.create(c, t.SEQUENCE, true, [
            a.create(c, t.SEQUENCE, true, [
              a.create(c, t.OID, false, a.oidToDer("2.16.840.1.101.3.4.2.1").getBytes()),
              a.create(c, t.NULL, false, ""),
              a.create(c, t.OCTETSTRING, false, "garbage")
            ]),
            a.create(c, t.OCTETSTRING, false, digest.toString("binary"))
          ])
        )
        .getBytes(),
      "binary"
    );
    const encoded = Buffer.concat([Buffer.from([0, 1]), Buffer.alloc(128 - der.length - 3, 255), Buffer.from([0]), der]);
    const signature = privateEncrypt({ key: keys.privateKey, padding: constants.RSA_NO_PADDING }, encoded);
    expect(() => key.verify(digest.toString("binary"), signature.toString("binary"))).toThrow(/DigestInfo/);
  });
  it("bounds legacy Zod diagnostics and retains correct successful/failed parsing", () => {
    expect(z.number().array().safeParse([1, 2, 3]).success).toBe(true);
    const small = z.number().array().safeParse(["invalid", "invalid"]);
    expect(small.error?.issues).toHaveLength(2);
    const large = z.number().array().safeParse(Array(5000).fill("invalid"));
    expect(large.success).toBe(false);
    expect(large.error?.issues.length).toBeLessThanOrEqual(200);
    expect(z.union([z.number(), z.string().array()]).array().safeParse(Array(5000).fill(null)).success).toBe(false);
  });
  it("preserves malformed URI input without entering exponential fallback decoding", () => {
    expect(decode("Blooms%20in%20Pink")).toBe("Blooms in Pink");
    expect(decode("hello+world")).toBe("hello world");
    const hostile = "%E0%A4%A".repeat(5000);
    expect(decode(hostile)).toBe(hostile);
  });
});
