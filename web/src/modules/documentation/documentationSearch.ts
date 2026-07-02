import type { DocSection } from "./documentationTypes";

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

export function filterSections(sections: DocSection[], query: string): DocSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections.filter((s) => sectionSearchText(s).includes(q));
}
