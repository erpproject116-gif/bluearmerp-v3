export type HelpChunkSource = "kb" | "guide";

export type HelpChunk = {
  id: string;
  source: HelpChunkSource;
  articleId: string;
  title: string;
  scenario?: string;
  text: string;
  steps?: string[];
  href: string;
  actionHref?: string;
  actionLabel?: string;
  moduleTags: string[];
};

export type HelpSearchHit = {
  chunk: HelpChunk;
  score: number;
  snippet: string;
};

export type HelpReplyHit = {
  title: string;
  scenario?: string;
  snippet: string;
  steps?: string[];
  articleHref: string;
  actionHref?: string;
  actionLabel?: string;
};

export type HelpReply = {
  query: string;
  hits: HelpReplyHit[];
  fallback: boolean;
  message: string;
};

export type HelpChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; reply: HelpReply };
