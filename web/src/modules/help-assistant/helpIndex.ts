import type { DocBlock, DocSection, KbArticle } from "../documentation/documentationTypes";
import { documentationSections } from "../documentation/documentationSections";
import { knowledgebaseArticles } from "../documentation/knowledgebaseArticles";
import type { HelpChunk, HelpChunkSource } from "./helpTypes";

function inferTagsFromHref(href?: string, relatedGuideIds?: string[]): string[] {
  const tags = new Set<string>();
  if (href) {
    const parts = href.replace(/^\/app\//, "").split("/").filter(Boolean);
    if (parts[0]) tags.add(parts[0].replace(/-/g, "-"));
    if (parts.length >= 2) tags.add(parts.slice(0, 2).join("-"));
  }
  for (const id of relatedGuideIds ?? []) {
    tags.add(id);
  }
  return [...tags];
}

function blockText(block: DocBlock): { text: string; steps?: string[] } {
  switch (block.type) {
    case "steps":
    case "flow":
      return { text: block.items.join(" "), steps: block.items };
    case "paragraph":
    case "tip":
    case "heading":
      return { text: block.text };
    default:
      return { text: "" };
  }
}

function pushArticleChunks(
  out: HelpChunk[],
  source: HelpChunkSource,
  article: KbArticle,
  href: string,
  extraTags: string[],
) {
  const moduleTags = [
    ...new Set([...inferTagsFromHref(article.primaryHref, article.relatedGuideIds), ...extraTags]),
  ];
  article.blocks.forEach((block, idx) => {
    const { text, steps } = blockText(block);
    if (!text.trim() && !steps?.length) return;
    out.push({
      id: `${source}:${article.id}#${idx}`,
      source,
      articleId: article.id,
      title: article.title,
      scenario: article.scenario,
      text: text.trim(),
      steps,
      href,
      actionHref: article.primaryHref,
      actionLabel: article.primaryLabel,
      moduleTags,
    });
  });
}

function pushSectionChunks(out: HelpChunk[], section: DocSection) {
  const href = `/app/documentation/${section.id}`;
  const moduleTags = [
    ...new Set([
      section.id,
      section.iconId,
      ...inferTagsFromHref(section.primaryHref),
    ]),
  ];
  const intro = section.intro?.trim();
  if (intro) {
    out.push({
      id: `guide:${section.id}#intro`,
      source: "guide",
      articleId: section.id,
      title: section.title,
      text: intro,
      href,
      actionHref: section.primaryHref,
      actionLabel: section.primaryLabel,
      moduleTags,
    });
  }
  section.blocks.forEach((block, idx) => {
    const { text, steps } = blockText(block);
    if (!text.trim() && !steps?.length) return;
    out.push({
      id: `guide:${section.id}#${idx}`,
      source: "guide",
      articleId: section.id,
      title: section.title,
      text: text.trim(),
      steps,
      href,
      actionHref: section.primaryHref,
      actionLabel: section.primaryLabel,
      moduleTags,
    });
  });
}

let cached: HelpChunk[] | null = null;

export function getHelpChunks(): HelpChunk[] {
  if (cached) return cached;
  const out: HelpChunk[] = [];
  for (const article of knowledgebaseArticles) {
    pushArticleChunks(out, "kb", article, `/app/documentation/kb/${article.id}`, ["kb"]);
  }
  for (const section of documentationSections) {
    pushSectionChunks(out, section);
  }
  cached = out;
  return out;
}
