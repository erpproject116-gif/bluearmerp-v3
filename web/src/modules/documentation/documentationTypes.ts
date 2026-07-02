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
