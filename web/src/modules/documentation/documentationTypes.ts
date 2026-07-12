export type DocBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "tip"; text: string }
  | { type: "flow"; items: string[] };

export type DocSection = {
  id: string;
  title: string;
  iconId: string;
  intro: string;
  blocks: DocBlock[];
  primaryHref?: string;
  primaryLabel?: string;
};

export type DocGroup = {
  id: string;
  title: string;
  description: string;
  sectionIds: string[];
};

/** Scenario-style help article (question → steps). */
export type KbArticle = {
  id: string;
  title: string;
  scenario: string;
  intro: string;
  blocks: DocBlock[];
  primaryHref?: string;
  primaryLabel?: string;
  relatedGuideIds?: string[];
  /** Extra paraphrases users type into Help / KB search. */
  questions?: string[];
  /** Exact or near-exact UI/API error strings that should retrieve this article. */
  errorPhrases?: string[];
};

export type KbGroup = {
  id: string;
  title: string;
  description: string;
  articleIds: string[];
};
