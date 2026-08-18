import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCmsArticleDocument } from "./cmsMarkdownCodec";

/**
 * Rewraps docs/content/blog/*.md so generated articles paste cleanly into Pages.
 * Run: npm run format:cms-articles
 */
describe("format cms articles", () => {
  it("rewrites blog markdown with wrapped body", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = resolve(here, "../../../../docs/content/blog");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const path = resolve(dir, file);
      const next = formatCmsArticleDocument(readFileSync(path, "utf8"));
      writeFileSync(path, next);
      expect(next.endsWith("\n")).toBe(true);
    }
  });
});
