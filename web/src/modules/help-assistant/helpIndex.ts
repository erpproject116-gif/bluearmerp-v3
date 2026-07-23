import type { DocBlock, DocSection, KbArticle } from "../documentation/documentationTypes";
import { documentationSections } from "../documentation/documentationSections";
import { knowledgebaseArticles } from "../documentation/knowledgebaseArticles";
import { helpArticleAliases } from "./helpArticleAliases";
import type { HelpChunk, HelpChunkSource } from "./helpTypes";

function inferTagsFromHref(href?: string, relatedGuideIds?: string[]): string[] {
  const tags = new Set<string>();
  if (href) {
    const parts = href.replace(/^\/app\//, "").split("/").filter(Boolean);
    if (parts[0]) tags.add(parts[0]);
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

function resolveAliases(article: KbArticle): { questions: string[]; errorPhrases: string[] } {
  const fromMap = helpArticleAliases[article.id];
  return {
    questions: [...new Set([...(article.questions ?? []), ...(fromMap?.questions ?? [])])],
    errorPhrases: [...new Set([...(article.errorPhrases ?? []), ...(fromMap?.errorPhrases ?? [])])],
  };
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
  const { questions, errorPhrases } = resolveAliases(article);
  const base = {
    source,
    articleId: article.id,
    title: article.title,
    scenario: article.scenario,
    href,
    actionHref: article.primaryHref,
    actionLabel: article.primaryLabel,
    moduleTags,
    questions,
    errorPhrases,
  };

  // Overview chunk so questions/errors score even when block text is thin.
  const overviewParts = [article.intro, article.scenario, ...questions, ...errorPhrases]
    .map((s) => s.trim())
    .filter(Boolean);
  if (overviewParts.length) {
    out.push({
      ...base,
      id: `${source}:${article.id}#overview`,
      text: overviewParts.join(" "),
    });
  }

  article.blocks.forEach((block, idx) => {
    const { text, steps } = blockText(block);
    if (!text.trim() && !steps?.length) return;
    out.push({
      ...base,
      id: `${source}:${article.id}#${idx}`,
      text: text.trim(),
      steps,
    });
  });
}

function pushSectionChunks(out: HelpChunk[], section: DocSection) {
  const href = `/app/documentation/${section.id}`;
  const moduleTags = [
    ...new Set([section.id, section.iconId, ...inferTagsFromHref(section.primaryHref)]),
  ];
  const fromMap = helpArticleAliases[section.id];
  const questions = fromMap?.questions ?? [];
  const errorPhrases = fromMap?.errorPhrases ?? [];
  const intro = section.intro?.trim();
  if (intro || questions.length || errorPhrases.length) {
    const overviewParts = [intro, ...questions, ...errorPhrases].map((s) => s?.trim()).filter(Boolean) as string[];
    out.push({
      id: `guide:${section.id}#intro`,
      source: "guide",
      articleId: section.id,
      title: section.title,
      text: overviewParts.join(" "),
      href,
      actionHref: section.primaryHref,
      actionLabel: section.primaryLabel,
      moduleTags,
      questions,
      errorPhrases,
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
      questions,
      errorPhrases,
    });
  });
}

let cached: HelpChunk[] | null = null;

/** Test helper — clears the chunk cache after content changes in the same process. */
export function clearHelpChunksCache() {
  cached = null;
}

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
