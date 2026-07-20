import { describe, expect, it } from "vitest";
import { extractWebsiteIngestCandidates } from "../src/vault/website-ingest-service";

describe("extractWebsiteIngestCandidates", () => {
  it("maps website DOM signals into reviewable Vault candidates with source evidence", () => {
    const sourceUrl = "https://raedat.example/";
    const extractedAt = new Date("2026-07-14T08:00:00.000Z");
    const candidates = extractWebsiteIngestCandidates(
      sourceUrl,
      `
        <!doctype html>
        <html lang="en">
          <head>
            <title>Raedat Jewelry | Luxury Bahrain Collections</title>
            <meta name="description" content="Luxury jewelry collections crafted for modern women in Bahrain." />
            <meta property="og:site_name" content="Raedat Jewelry" />
          </head>
          <body style="--brand:#78dad1; color:#f2c84b">
            <h1>Luxury Jewelry Collection Launch</h1>
            <p>Our premium handcrafted jewelry celebrates elegance, heritage, and meticulous craftsmanship.</p>
            <p>نصمم مجوهرات فاخرة للنساء في البحرين مع خدمة مخصصة.</p>
            <p>Shop our bridal collection, custom pieces, and gift packages online.</p>
            <a href="/collections">Shop collections</a>
            <a href="/services">Jewelry services</a>
            <img src="/ring.jpg" alt="Gold ring with pearl detail" />
          </body>
        </html>
      `,
      extractedAt
    );
    const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
    const company = byKey.get("website-profile");
    const story = byKey.get("website-story");
    const products = byKey.get("website-products");
    const brand = byKey.get("website-visual-signals");
    const tone = byKey.get("website-voice");

    expect(candidates.map((candidate) => candidate.section)).toEqual(["COMPANY", "STORY", "PRODUCTS", "BRAND", "TONE"]);
    expect(company).toMatchObject({
      confidence: expect.any(Number),
      extractedAt: extractedAt.toISOString(),
      key: "website-profile",
      section: "COMPANY",
      sourceSnippet: "Luxury jewelry collections crafted for modern women in Bahrain.",
      sourceUrl
    });
    expect(company?.value).toMatchObject({
      description: "Luxury jewelry collections crafted for modern women in Bahrain.",
      languages: ["Arabic", "English"],
      name: "Raedat Jewelry",
      source: {
        extractedAt: extractedAt.toISOString(),
        extractionMethod: "dom_signals_v1",
        sourceUrl,
        type: "website_ingest"
      }
    });
    expect(story?.value).toMatchObject({
      proofPoints: expect.arrayContaining([
        "Our premium handcrafted jewelry celebrates elegance, heritage, and meticulous craftsmanship.",
        "نصمم مجوهرات فاخرة للنساء في البحرين مع خدمة مخصصة."
      ])
    });
    expect(products?.value).toMatchObject({
      discoveredItems: expect.arrayContaining([
        expect.objectContaining({ name: expect.stringContaining("Collection") }),
        expect.objectContaining({ name: "Shop collections" })
      ])
    });
    expect(brand?.value).toMatchObject({
      colors: ["#78DAD1", "#F2C84B"],
      note: "Website imagery is treated as brand reference until reuse rights are confirmed.",
      visualReferences: ["Gold ring with pearl detail"]
    });
    expect(tone?.value).toMatchObject({
      toneWords: expect.arrayContaining(["premium"])
    });
    expect(candidates.every((candidate) => candidate.confidence > 0 && candidate.confidence <= 0.9)).toBe(true);
  });

  it("does not invent sections when public website evidence is too sparse", () => {
    const candidates = extractWebsiteIngestCandidates(
      "https://empty.example/",
      "<html><head></head><body><p>Hi</p><a>Ok</a></body></html>",
      new Date("2026-07-14T08:00:00.000Z")
    );

    expect(candidates).toEqual([]);
  });
});
