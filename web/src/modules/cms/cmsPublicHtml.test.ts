import { describe, expect, it } from "vitest";
import { markdownToPublicHtml, parseYouTubeId } from "./cmsMarkdownCodec";
import {
  articleHttpDecision,
  legacyArticlesPath,
  publicMediaUrl,
  renderArticleHtmlMeta,
  renderArticleMarkdown,
  rewriteCmsMediaInMarkdown,
} from "./cmsPublicHtml";
import { CMS_FACEBOOK_PAGE, facebookShareUrl } from "./cmsSocial";
import { cmsSeoChecks, givenSeoTitle } from "./cmsSeo";

const sampleBody = `Sa **tindahan**, meron pa.

## Akala ninyo okay pa

Excel pa rin.

![pic](cms-media:12)

![YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)

[More](/articles)
`;

describe("public html builder", () => {
  it("renders h2, youtube-nocookie iframe, media URL, facebook footer and sharer", () => {
    const page = {
      id: 1,
      title: "Bakit palaging nagsisinungaling ang meron pa?",
      topic: "bodega-at-stock",
      slug: "meron-pa-na-palaging-mali",
      permalink: "/articles/bodega-at-stock/meron-pa-na-palaging-mali",
      body: sampleBody,
      seo_title: "Bakit palaging mali ang meron pa",
      seo_description: "Sa SME ang meron pa ay tiwala.",
      featured_media_id: 9,
      featured_media_alt: "Empty shelf",
      published_at: "2026-08-18T00:00:00Z",
      lang: "tl",
    };
    const env = {
      siteUrl: "https://www.example.com",
      apiBase: "https://api.example.com",
      siteName: "Bluearm",
    };
    const { html, csp } = renderArticleHtmlMeta(page, env);
    expect(html).toContain("<h1>Bakit palaging nagsisinungaling ang meron pa?</h1>");
    expect(html).toContain("<h2>");
    expect(html).not.toContain("seo_title:");
    expect(html).toContain("youtube-nocookie.com/embed/");
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(html).toContain(publicMediaUrl(env.apiBase, 12));
    expect(html).toContain("facebook.com/BluearmERPGlobal");
    expect(html).toContain(facebookShareUrl("https://www.example.com/articles/bodega-at-stock/meron-pa-na-palaging-mali"));
    expect(html).toContain(CMS_FACEBOOK_PAGE);
    expect(html).toContain("application/ld+json");
    expect(html).toContain("BlogPosting");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("youtube-nocookie.com");
    const md = renderArticleMarkdown(page, env);
    expect(md).toContain("Like and follow our page https://www.facebook.com/BluearmERPGlobal/");
    expect(md).toContain(publicMediaUrl(env.apiBase, 12));
    expect(rewriteCmsMediaInMarkdown("![a](cms-media:3)", env.apiBase)).toContain("/media/3/download");
    expect(markdownToPublicHtml("## Hello\n\nWorld", () => "")).toContain("<h2>");
  });
});

describe("seo given defaults", () => {
  it("uses title when seo_title is blank", () => {
    expect(givenSeoTitle("Hello", "", "Bluearm")).toBe("Hello | Bluearm");
  });

  it("warns when facebook chrome is in the body", () => {
    const checks = cmsSeoChecks({
      title: "Bakit?",
      topic: "bodega-at-stock",
      slug: "meron-pa",
      body: "## Akala\n\nSee facebook.com/BluearmERPGlobal\n\n[x](/articles)",
      series: "sme-walang-sistema",
    });
    expect(checks.find((c) => c.id === "fb-chrome")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "h1-q")?.ok).toBe(true);
  });
});

describe("article HTTP helpers", () => {
  it("301s legacy /app/articles paths", () => {
    expect(legacyArticlesPath("bodega-at-stock", "meron-pa")).toBe("/articles/bodega-at-stock/meron-pa");
    expect(legacyArticlesPath("bodega-at-stock")).toBe("/articles/bodega-at-stock");
    expect(legacyArticlesPath()).toBe("/articles");
  });

  it("301s slug redirects and wrong topic; 404s missing pages", () => {
    expect(articleHttpDecision({ redirectTo: "/articles/blog/new-slug" })).toEqual({
      status: 301,
      location: "/articles/blog/new-slug",
    });
    expect(articleHttpDecision({ page: null })).toEqual({ status: 404 });
    const page = {
      id: 1,
      title: "Hello",
      topic: "bodega-at-stock",
      slug: "meron-pa",
      permalink: "/articles/bodega-at-stock/meron-pa",
    };
    expect(articleHttpDecision({ page, requestTopic: "blog" })).toEqual({
      status: 301,
      location: "/articles/bodega-at-stock/meron-pa",
    });
    expect(articleHttpDecision({ page, requestTopic: "bodega-at-stock" }).status).toBe(200);
  });
});
