import { parseCmsMarkdown, splitFrontmatter } from "./cmsMarkdownCodec";
import { bodyHasFacebookChrome } from "./cmsSocial";

export type CmsSeoInput = {
  title: string;
  topic: string;
  slug: string;
  body: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  featuredMediaId?: number | null;
  featuredMediaAlt?: string | null;
  focusPhrase?: string | null;
  series?: string;
};

export type CmsSeoCheck = {
  id: string;
  ok: boolean;
  warn: boolean;
  label: string;
};

export function givenSeoTitle(title: string, seoTitle?: string | null, siteName = "Bluearm"): string {
  const t = (seoTitle || "").trim() || title.trim();
  if (!t) return siteName;
  if (t.toLowerCase().endsWith(`| ${siteName.toLowerCase()}`) || t === siteName) return t;
  return `${t} | ${siteName}`;
}

export function givenSeoDescription(_body: string, seoDescription?: string | null, firstParagraph?: string): string {
  const d = (seoDescription || "").trim();
  if (d) return d.slice(0, 320);
  const fb = (firstParagraph || "").trim();
  return fb.slice(0, 160);
}

export function serpTitleLen(s: string): { chars: number; band: "short" | "ok" | "long" } {
  const n = [...s].length;
  if (n < 30) return { chars: n, band: "short" };
  if (n > 60) return { chars: n, band: "long" };
  return { chars: n, band: "ok" };
}

export function serpDescLen(s: string): { chars: number; band: "short" | "ok" | "long" } {
  const n = [...s].length;
  if (n < 120) return { chars: n, band: "short" };
  if (n > 160) return { chars: n, band: "long" };
  return { chars: n, band: "ok" };
}

export function cmsSeoChecks(input: CmsSeoInput): CmsSeoCheck[] {
  const { body } = splitFrontmatter(input.body || "");
  const blocks = parseCmsMarkdown(body);
  const firstP = blocks.find((b) => b.type === "p")?.type === "p" ? blocks.find((b) => b.type === "p") : undefined;
  const firstText = firstP && firstP.type === "p" ? firstP.text : "";
  const headings = blocks.filter((b) => b.type === "h");
  const h2Count = headings.filter((b) => b.type === "h" && b.level === 2).length;
  const titleInBody = blocks.some((b) => b.type === "h" && b.text.trim() === input.title.trim());
  const hasInternal = /\]\(\/articles(?:\/|\))/.test(body);
  const phrase = (input.focusPhrase || "").trim().toLowerCase();
  const hay = `${input.title}\n${firstText}\n${input.slug}`.toLowerCase();
  const out: CmsSeoCheck[] = [
    { id: "body", ok: body.trim().length > 0, warn: false, label: "Body is not empty" },
    { id: "h2", ok: h2Count >= 1, warn: h2Count === 0, label: "At least one H2 heading" },
    { id: "h1-dup", ok: !titleInBody, warn: titleInBody, label: "Title is not repeated as a heading in the body" },
    { id: "slug", ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug), warn: false, label: "Slug is kebab-case" },
    { id: "topic", ok: Boolean(input.topic && input.topic !== ""), warn: false, label: "Topic cluster is set" },
    {
      id: "image",
      ok: Boolean(input.featuredMediaId) && Boolean((input.featuredMediaAlt || "").trim()),
      warn: Boolean(input.featuredMediaId) && !(input.featuredMediaAlt || "").trim(),
      label: "Featured image has alt text",
    },
    { id: "internal", ok: hasInternal, warn: !hasInternal, label: "Links to /articles or another post" },
    { id: "yaml", ok: !body.trimStart().startsWith("---"), warn: false, label: "No leftover YAML in the body" },
  ];
  if (phrase) {
    out.push({
      id: "focus",
      ok: hay.includes(phrase),
      warn: !hay.includes(phrase),
      label: "Focus phrase appears in title, slug, or first paragraph",
    });
  }
  if ((input.series || "") === "sme-walang-sistema" || /\?/.test(input.title)) {
    out.push({
      id: "h1-q",
      ok: input.title.includes("?"),
      warn: !input.title.includes("?"),
      label: "Title is a question",
    });
    out.push({
      id: "brand-h1",
      ok: !/\bbluearm\b/i.test(input.title),
      warn: /\bbluearm\b/i.test(input.title),
      label: "Bluearm is not in the H1",
    });
  }
  if (bodyHasFacebookChrome(body)) {
    out.push({
      id: "fb-chrome",
      ok: false,
      warn: true,
      label: "Facebook footer belongs in chrome, not the body",
    });
  }
  return out;
}

export function seoIncomplete(input: CmsSeoInput, firstParagraph: string): boolean {
  const desc = (input.seoDescription || "").trim() || firstParagraph.trim();
  if (!desc) return true;
  if (!input.featuredMediaId) return true;
  return false;
}
