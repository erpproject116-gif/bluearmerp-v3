import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractCmsArticlePaste,
  formatCmsArticleDocument,
  formatCmsMarkdownBody,
  htmlToMarkdown,
  looksLikeMarkdown,
  markdownToSafeHtml,
} from "./cmsMarkdownCodec";
import { insertCmsMediaToken } from "./CmsMarkdown";
import { permissionCodeForHref } from "../../shared/permissionCodes";
import { cmsArticlePath, DEFAULT_CMS_TOPIC, safeArticlesPath } from "./cmsPermalink";

describe("cms markdown tokens", () => {
  it("appends a cms-media token", () => {
    expect(insertCmsMediaToken("", 12, "Store front")).toBe("![Store front](cms-media:12)");
    expect(insertCmsMediaToken("Hello", 3, "")).toBe("Hello\n\n![image](cms-media:3)\n");
  });
});

describe("cms permalinks", () => {
  it("builds /articles/{topic}/{slug}", () => {
    expect(cmsArticlePath("sme-walang-sistema", "meron-pa-na-palaging-mali")).toBe(
      "/articles/sme-walang-sistema/meron-pa-na-palaging-mali",
    );
    expect(cmsArticlePath("", "Store Hours")).toBe(`/articles/${DEFAULT_CMS_TOPIC}/store-hours`);
    expect(safeArticlesPath("/articles/sme-walang-sistema/meron-pa-na-palaging-mali")).toBe(
      "/articles/sme-walang-sistema/meron-pa-na-palaging-mali",
    );
    expect(safeArticlesPath("/articles/../../etc")).toBeNull();
    expect(safeArticlesPath("/app/articles/blog/x")).toBeNull();
  });
});

describe("cms permission hrefs", () => {
  it("maps reader and editor paths to cms.pages", () => {
    expect(permissionCodeForHref("/app/cms/p/store-hours")).toBe("cms.pages");
    expect(permissionCodeForHref("/app/articles/sme-walang-sistema/meron-pa-na-palaging-mali")).toBe("cms.pages");
    expect(permissionCodeForHref("/app/articles")).toBe("cms.pages");
    expect(permissionCodeForHref("/articles/sme-walang-sistema/meron-pa-na-palaging-mali")).toBeUndefined();
    expect(permissionCodeForHref("/app/cms/pages/42")).toBe("cms.pages");
    expect(permissionCodeForHref("/app/cms/pages/settings")).toBe("cms.pages");
    expect(permissionCodeForHref("/app/cms/media")).toBe("cms.media");
  });
});

describe("cms markdown codec", () => {
  it("strips generated frontmatter and fills paste fields", () => {
    const raw = `---
title: Hello shop
slug: hello-shop
series: sme-walang-sistema
seo_title: Hello tab
seo_description: A short desk.
---

## Why

Sa **tindahan**, meron pa.
`;
    const pasted = extractCmsArticlePaste(raw);
    expect(pasted.title).toBe("Hello shop");
    expect(pasted.slug).toBe("hello-shop");
    expect(pasted.topic).toBe("sme-walang-sistema");
    expect(pasted.seoTitle).toBe("Hello tab");
    expect(pasted.body).toContain("## Why");
    expect(pasted.body).not.toContain("seo_title");
    expect(looksLikeMarkdown(raw)).toBe(true);
  });

  it("wraps long paragraphs and keeps headings", () => {
    const md = "## Akala\n\n" + "Salita ".repeat(40).trim();
    const out = formatCmsMarkdownBody(md);
    expect(out.startsWith("## Akala")).toBe(true);
    expect(out.split("\n").some((l) => l.startsWith("Salita"))).toBe(true);
  });

  it("round-trips simple html", () => {
    const html = "<h2>Hello</h2><p>This is <strong>bold</strong> and <em>italic</em>.</p><ol><li>One</li><li>Two</li></ol>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("## Hello");
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
    expect(md).toContain("1. One");
    const back = markdownToSafeHtml(md);
    expect(back).toContain("<h2>");
    expect(back).toContain("<strong>");
  });

  it("formats the meron-pa article for CMS paste", () => {
    const path = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../docs/content/blog/01-meron-pa-na-palaging-mali.md",
    );
    const raw = readFileSync(path, "utf8");
    const formatted = formatCmsArticleDocument(raw);
    const pasted = extractCmsArticlePaste(formatted);
    expect(pasted.slug).toBe("meron-pa-na-palaging-mali");
    expect(pasted.topic).toBe("sme-walang-sistema");
    expect(pasted.body).toContain("## Akala ninyo okay pa");
    expect(pasted.body).toContain('**"meron pa"**');
    expect(formatted.startsWith("---\n")).toBe(true);
  });
});
