import { knowledgebaseArticles } from "./knowledgebaseArticles";

/** Inverse index: guide section id → KB article ids that link back via relatedGuideIds. */
let cached: Map<string, string[]> | null = null;

export function kbArticlesForSection(sectionId: string): string[] {
  if (!cached) {
    const map = new Map<string, string[]>();
    for (const article of knowledgebaseArticles) {
      for (const guideId of article.relatedGuideIds ?? []) {
        const list = map.get(guideId) ?? [];
        if (!list.includes(article.id)) list.push(article.id);
        map.set(guideId, list);
      }
    }
    cached = map;
  }
  return cached.get(sectionId) ?? [];
}
