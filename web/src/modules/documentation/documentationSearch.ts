import type { DocSection, KbArticle } from "./documentationTypes";

/** Flatten section text for client-side search. */
export function sectionSearchText(section: DocSection): string {
  const parts = [section.title, section.intro];
  for (const block of section.blocks) {
    if (block.type === "paragraph" || block.type === "tip" || block.type === "heading") {
      parts.push(block.text);
    } else {
      parts.push(...block.items);
    }
  }
  return parts.join(" ").toLowerCase();
}

export function articleSearchText(article: KbArticle): string {
  const parts = [article.title, article.scenario, article.intro];
  for (const block of article.blocks) {
    if (block.type === "paragraph" || block.type === "tip" || block.type === "heading") {
      parts.push(block.text);
    } else {
      parts.push(...block.items);
    }
  }
  return parts.join(" ").toLowerCase();
}

export function filterSections(sections: DocSection[], query: string): DocSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections.filter((s) => sectionSearchText(s).includes(q));
}

export function filterKbArticles(articles: KbArticle[], query: string): KbArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles;
  return articles.filter((a) => articleSearchText(a).includes(q));
}
