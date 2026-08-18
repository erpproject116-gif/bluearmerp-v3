import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractCmsArticlePaste } from "./cmsMarkdownCodec";
import { cmsSeoChecks, seoIncomplete } from "./cmsSeo";

const goldPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/content/blog/01-meron-pa-na-palaging-mali.md");

describe("cms SEO checklist", () => {
  it("gold post #1 mostly passes (question H1, H2s, no Bluearm in title)", () => {
    const raw = readFileSync(goldPath, "utf8");
    const paste = extractCmsArticlePaste(raw);
    const checks = cmsSeoChecks({
      title: paste.title || "",
      topic: paste.topic || "",
      slug: paste.slug || "",
      body: paste.body,
      seoTitle: paste.seoTitle,
      seoDescription: paste.seoDescription,
      featuredMediaId: 1,
      featuredMediaAlt: "Empty rack",
      series: "sme-walang-sistema",
    });
    expect(checks.find((c) => c.id === "body")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "h2")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "h1-q")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "brand-h1")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "slug")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "yaml")?.ok).toBe(true);
    expect(checks.find((c) => c.id === "fb-chrome")).toBeUndefined();
  });

  it("warns on a Help-style numbered tutorial", () => {
    const checks = cmsSeoChecks({
      title: "How to receive stock in Bluearm",
      topic: "",
      slug: "How_To_Receive",
      body: `# How to receive stock in Bluearm

1. Open Inventory.
2. Click Receive.
3. Save the document.

Do this every morning.`,
      series: "sme-walang-sistema",
    });
    expect(checks.find((c) => c.id === "h2")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "slug")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "topic")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "h1-q")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "brand-h1")?.ok).toBe(false);
  });

  it("marks SEO incomplete without description or featured image", () => {
    expect(seoIncomplete({ title: "A", topic: "blog", slug: "a", body: "Hi" }, "")).toBe(true);
    expect(seoIncomplete({ title: "A", topic: "blog", slug: "a", body: "Hi", seoDescription: "Desk", featuredMediaId: 9 }, "Hi")).toBe(false);
  });
});
