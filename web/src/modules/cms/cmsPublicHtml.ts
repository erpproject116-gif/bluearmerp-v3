import { firstParagraphPlain, markdownToPublicHtml, splitFrontmatter } from "./cmsMarkdownCodec";
import { cmsArticlePath, cmsTopicPath, CMS_ARTICLES_PREFIX } from "./cmsPermalink";
import {
  articleFooterHtml,
  articleFooterMarkdown,
  CMS_DEFAULT_LANG,
  CMS_FACEBOOK_PAGE,
  CMS_SITE_NAME_DEFAULT,
} from "./cmsSocial";
import { givenSeoDescription, givenSeoTitle } from "./cmsSeo";

export type CmsPublicPage = {
  id: number;
  title: string;
  topic?: string;
  slug: string;
  permalink?: string;
  status?: string;
  body?: string;
  seo_title?: string | null;
  seo_description?: string | null;
  featured_media_id?: number | null;
  featured_media_alt?: string | null;
  featured_media_mime?: string | null;
  published_at?: string | null;
  lang?: string | null;
};

export type CmsPublicEnv = {
  siteUrl: string;
  apiBase: string;
  siteName?: string;
  noindex?: boolean;
};

export type CmsHtmlResult = {
  status: number;
  location?: string;
  contentType: string;
  body: string;
  nonce?: string;
  csp?: string;
};

function trimSlash(s: string): string {
  return (s || "").replace(/\/+$/, "");
}

export function absUrl(siteUrl: string, path: string): string {
  const base = trimSlash(siteUrl);
  if (!path) return base || "/";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** `/app/articles…` → public catalog path (HTTP 301 at the HTML function). */
export function legacyArticlesPath(topic?: string, slug?: string): string {
  if (slug) return `/articles/${topic || "blog"}/${slug}`;
  if (topic) return `/articles/${topic}`;
  return "/articles";
}

export type ArticleHttpDecision = { status: 200 | 301 | 404; location?: string };

/** Keep JSON 200 + redirect_to for the SPA; the HTML function maps it to HTTP 301. */
export function articleHttpDecision(opts: {
  page?: CmsPublicPage | null;
  redirectTo?: string;
  requestTopic?: string;
}): ArticleHttpDecision {
  const to = (opts.redirectTo || "").trim();
  if (to) return { status: 301, location: to };
  if (!opts.page) return { status: 404 };
  const want = (opts.page.topic || "blog").toLowerCase();
  const got = (opts.requestTopic || "").toLowerCase();
  if (got && got !== want) {
    return { status: 301, location: opts.page.permalink || `/articles/${want}/${opts.page.slug}` };
  }
  return { status: 200 };
}

export function publicMediaUrl(apiBase: string, id: number): string {
  return `${trimSlash(apiBase)}/api/v1/public/cms/media/${id}/download`;
}

export function rewriteCmsMediaInMarkdown(md: string, apiBase: string): string {
  return (md || "").replace(/!\[([^\]]*)\]\(cms-media:(\d+)\)/g, (_m, alt, id) => {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) return `![${alt}](cms-media:${id})`;
    return `![${alt}](${publicMediaUrl(apiBase, n)})`;
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function articleCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "media-src 'self' https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https:",
    "frame-src 'self' https://www.youtube-nocookie.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

function newNonce(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildJsonLd(opts: {
  siteUrl: string;
  siteName: string;
  page: CmsPublicPage;
  canonical: string;
  description: string;
  imageUrl?: string | null;
  kind: "article" | "hub";
  items?: { title: string; url: string }[];
}): unknown {
  const org = {
    "@type": "Organization",
    "@id": `${opts.siteUrl}/#organization`,
    name: opts.siteName,
    url: opts.siteUrl,
    sameAs: [CMS_FACEBOOK_PAGE],
  };
  const website = {
    "@type": "WebSite",
    "@id": `${opts.siteUrl}/#website`,
    name: opts.siteName,
    url: opts.siteUrl,
    publisher: { "@id": `${opts.siteUrl}/#organization` },
  };
  if (opts.kind === "hub") {
    const itemList = (opts.items ?? []).map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: it.url,
      name: it.title,
    }));
    return {
      "@context": "https://schema.org",
      "@graph": [
        org,
        website,
        {
          "@type": "CollectionPage",
          "@id": `${opts.canonical}#webpage`,
          url: opts.canonical,
          name: opts.page.title,
          isPartOf: { "@id": `${opts.siteUrl}/#website` },
          mainEntity: { "@type": "ItemList", itemListElement: itemList },
        },
      ],
    };
  }
  const image = opts.imageUrl
    ? {
        "@type": "ImageObject",
        url: opts.imageUrl,
        caption: opts.page.featured_media_alt || undefined,
      }
    : undefined;
  const topic = opts.page.topic || "blog";
  return {
    "@context": "https://schema.org",
    "@graph": [
      org,
      website,
      {
        "@type": "BlogPosting",
        "@id": `${opts.canonical}#blogposting`,
        headline: opts.page.title,
        description: opts.description,
        datePublished: opts.page.published_at || undefined,
        inLanguage: opts.page.lang || CMS_DEFAULT_LANG,
        mainEntityOfPage: opts.canonical,
        url: opts.canonical,
        author: { "@id": `${opts.siteUrl}/#organization` },
        publisher: { "@id": `${opts.siteUrl}/#organization` },
        image,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Articles", item: absUrl(opts.siteUrl, CMS_ARTICLES_PREFIX) },
          { "@type": "ListItem", position: 2, name: topic, item: absUrl(opts.siteUrl, cmsTopicPath(topic)) },
          { "@type": "ListItem", position: 3, name: opts.page.title, item: opts.canonical },
        ],
      },
    ],
  };
}

const PAGE_CSS = `body{margin:0;font-family:Outfit,system-ui,sans-serif;background:#f8fafc;color:#0f172a;line-height:1.6}
header,main,footer.cms-chrome{max-width:48rem;margin:0 auto;padding:1rem 1.25rem}
header{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;background:#fff;max-width:none;padding:0.75rem 1.25rem}
header .inner{max-width:48rem;margin:0 auto;display:flex;justify-content:space-between;width:100%}
a{color:#2563eb}img{max-width:100%;height:auto;border-radius:0.5rem}h1{font-size:1.75rem;line-height:1.25}
.cms-yt iframe{width:100%;aspect-ratio:16/9;border:0;border-radius:0.5rem}
.cms-follow{margin-top:2rem;padding-top:1rem;border-top:1px solid #e2e8f0;font-size:0.95rem}
.cms-follow-page{display:inline-flex;align-items:center;gap:0.35rem;font-weight:600}
.crumbs{font-size:0.875rem;color:#475569}time{color:#475569;font-size:0.875rem}`;

function wrapDocument(opts: {
  lang: string;
  title: string;
  description: string;
  canonical: string;
  mdUrl: string;
  ogImage?: string;
  ogImageAlt?: string;
  jsonLd: unknown;
  nonce: string;
  noindex?: boolean;
  inner: string;
}): string {
  const robots = opts.noindex ? "noindex,nofollow" : "index,follow";
  const ld = JSON.stringify(opts.jsonLd);
  return `<!DOCTYPE html>
<html lang="${escapeAttr(opts.lang)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeAttr(opts.title)}</title>
<meta name="description" content="${escapeAttr(opts.description)}"/>
<meta name="robots" content="${robots}"/>
<link rel="canonical" href="${escapeAttr(opts.canonical)}"/>
<link rel="alternate" type="text/markdown" href="${escapeAttr(opts.mdUrl)}"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="${escapeAttr(opts.title)}"/>
<meta property="og:description" content="${escapeAttr(opts.description)}"/>
<meta property="og:url" content="${escapeAttr(opts.canonical)}"/>
${opts.ogImage ? `<meta property="og:image" content="${escapeAttr(opts.ogImage)}"/>` : ""}
${opts.ogImageAlt ? `<meta property="og:image:alt" content="${escapeAttr(opts.ogImageAlt)}"/>` : ""}
<meta name="twitter:card" content="summary_large_image"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap"/>
<style>${PAGE_CSS}</style>
<script type="application/ld+json" nonce="${opts.nonce}">${ld}</script>
</head>
<body>
<header><div class="inner"><a href="${CMS_ARTICLES_PREFIX}">BluearmERP</a><a href="/signin">Sign in</a></div></header>
${opts.inner}
</body>
</html>`;
}

export function renderArticleHtml(page: CmsPublicPage, env: CmsPublicEnv): string {
  const nonce = newNonce();
  const siteName = env.siteName || CMS_SITE_NAME_DEFAULT;
  const permalink = page.permalink || cmsArticlePath(page.topic, page.slug);
  const canonical = absUrl(env.siteUrl, permalink);
  const mdUrl = `${canonical}.md`;
  const { body } = splitFrontmatter(page.body || "");
  const first = firstParagraphPlain(body);
  const title = givenSeoTitle(page.title, page.seo_title, siteName);
  const description = givenSeoDescription(body, page.seo_description, first);
  const imageUrl = page.featured_media_id ? publicMediaUrl(env.apiBase, page.featured_media_id) : undefined;
  const bodyHtml = markdownToPublicHtml(body, (id) => publicMediaUrl(env.apiBase, id));
  const jsonLd = buildJsonLd({
    siteUrl: trimSlash(env.siteUrl),
    siteName,
    page,
    canonical,
    description,
    imageUrl,
    kind: "article",
  });
  const topic = page.topic || "blog";
  const time = page.published_at
    ? `<time datetime="${escapeAttr(page.published_at)}">${escapeAttr(page.published_at.slice(0, 10))}</time>`
    : "";
  const hero = imageUrl
    ? `<p><img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(page.featured_media_alt || "")}"/></p>`
    : "";
  const inner = `<main>
<article>
<nav class="crumbs"><a href="${CMS_ARTICLES_PREFIX}">Articles</a> / <a href="${cmsTopicPath(topic)}">${escapeAttr(topic)}</a></nav>
<h1>${escapeAttr(page.title)}</h1>
${time}
${hero}
${bodyHtml}
${articleFooterHtml(canonical)}
</article>
</main>`;
  return wrapDocument({
    lang: page.lang || CMS_DEFAULT_LANG,
    title,
    description,
    canonical,
    mdUrl,
    ogImage: imageUrl,
    ogImageAlt: page.featured_media_alt || undefined,
    jsonLd,
    nonce,
    noindex: env.noindex,
    inner,
  });
}

export function renderArticleHtmlMeta(page: CmsPublicPage, env: CmsPublicEnv): { nonce: string; csp: string; html: string } {
  const html = renderArticleHtml(page, env);
  const nonceMatch = html.match(/nonce="([^"]+)"/);
  const nonce = nonceMatch?.[1] || newNonce();
  return { nonce, csp: articleCsp(nonce), html };
}

export function renderHubHtml(
  rows: CmsPublicPage[],
  env: CmsPublicEnv,
  topic?: string,
): { nonce: string; csp: string; html: string } {
  const nonce = newNonce();
  const siteName = env.siteName || CMS_SITE_NAME_DEFAULT;
  const path = topic ? cmsTopicPath(topic) : CMS_ARTICLES_PREFIX;
  const canonical = absUrl(env.siteUrl, path);
  const title = topic ? `${topic} | ${siteName}` : `Articles | ${siteName}`;
  const description = topic ? `Bluearm articles in ${topic}.` : "Bluearm articles for Philippine trading SMEs.";
  const items = rows.map((r) => ({
    title: r.title,
    url: absUrl(env.siteUrl, r.permalink || cmsArticlePath(r.topic, r.slug)),
  }));
  const jsonLd = buildJsonLd({
    siteUrl: trimSlash(env.siteUrl),
    siteName,
    page: { id: 0, title, slug: topic || "articles", topic },
    canonical,
    description,
    kind: "hub",
    items,
  });
  const cards = rows
    .map((r) => {
      const href = r.permalink || cmsArticlePath(r.topic, r.slug);
      const desc = (r.seo_description || "").trim();
      return `<li><a href="${escapeAttr(href)}"><strong>${escapeAttr(r.title)}</strong></a>${desc ? `<p>${escapeAttr(desc)}</p>` : ""}</li>`;
    })
    .join("");
  const inner = `<main><article><h1>${escapeAttr(topic || "Articles")}</h1><ul>${cards}</ul></article></main>`;
  const html = wrapDocument({
    lang: CMS_DEFAULT_LANG,
    title,
    description,
    canonical,
    mdUrl: absUrl(env.siteUrl, "/articles.md"),
    jsonLd,
    nonce,
    inner,
  });
  return { nonce, csp: articleCsp(nonce), html };
}

export function renderNotFoundHtml(): { nonce: string; csp: string; html: string } {
  const nonce = newNonce();
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Not found</title><meta name="robots" content="noindex"/></head><body><h1>Page not found</h1><p><a href="${CMS_ARTICLES_PREFIX}">Articles</a></p></body></html>`;
  return { nonce, csp: articleCsp(nonce), html };
}

export function renderArticleMarkdown(page: CmsPublicPage, env: CmsPublicEnv): string {
  const permalink = page.permalink || cmsArticlePath(page.topic, page.slug);
  const canonical = absUrl(env.siteUrl, permalink);
  const { body } = splitFrontmatter(page.body || "");
  const rewritten = rewriteCmsMediaInMarkdown(body, env.apiBase);
  const first = firstParagraphPlain(body);
  const desc = givenSeoDescription(body, page.seo_description, first);
  const fm = [
    "---",
    `title: ${JSON.stringify(page.title)}`,
    `topic: ${page.topic || "blog"}`,
    `slug: ${page.slug}`,
    `lang: ${page.lang || CMS_DEFAULT_LANG}`,
    `canonical: ${canonical}`,
    page.seo_title ? `seo_title: ${JSON.stringify(page.seo_title)}` : "",
    desc ? `seo_description: ${JSON.stringify(desc)}` : "",
    "---",
    "",
    rewritten.trim(),
    "",
    articleFooterMarkdown(),
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
  return fm.endsWith("\n") ? fm : `${fm}\n`;
}

export function renderRobotsTxt(siteUrl: string): string {
  const base = trimSlash(siteUrl);
  return `User-agent: *
Allow: /articles
Allow: /articles.md
Allow: /llms.txt
Allow: /sitemap.xml
Disallow: /app
Disallow: /api

User-agent: GPTBot
Allow: /articles
Allow: /llms.txt

Sitemap: ${base}/sitemap.xml
`;
}

export function renderSitemapXml(siteUrl: string, rows: CmsPublicPage[]): string {
  const urls = [
    absUrl(siteUrl, CMS_ARTICLES_PREFIX),
    ...rows.map((r) => absUrl(siteUrl, r.permalink || cmsArticlePath(r.topic, r.slug))),
  ];
  const body = urls
    .map((u) => `  <url><loc>${escapeAttr(u)}</loc><changefreq>weekly</changefreq></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderLlmsTxt(siteUrl: string, rows: CmsPublicPage[], full = false): string {
  const base = trimSlash(siteUrl);
  const lines = [
    "# Bluearm",
    "",
    "Philippine trading SME operations articles.",
    "",
    `Hub: ${base}/articles.md`,
    "",
  ];
  for (const r of rows) {
    const path = r.permalink || cmsArticlePath(r.topic, r.slug);
    lines.push(`- [${r.title}](${base}${path}.md)`);
    if (full && r.seo_description) lines.push(`  ${r.seo_description}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderArticlesIndexMd(siteUrl: string, rows: CmsPublicPage[]): string {
  const lines = ["# Bluearm articles", ""];
  for (const r of rows) {
    const path = r.permalink || cmsArticlePath(r.topic, r.slug);
    lines.push(`- [${r.title}](${absUrl(siteUrl, path)}.md)`);
  }
  lines.push("");
  return lines.join("\n");
}
