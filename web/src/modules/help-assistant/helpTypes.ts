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
  questions?: string[];
  errorPhrases?: string[];
};

export type HelpSearchHit = {
  chunk: HelpChunk;
  score: number;
  snippet: string;
};

export type HelpReplyHit = {
  articleId: string;
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
  suggestions?: string[];
  usedAi?: boolean;
};

export type HelpChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; reply: HelpReply };

export type HelpFeedbackVote = "up" | "down";

export type HelpFeedbackEvent = {
  at: string;
  query: string;
  pathname: string;
  articleId: string;
  vote: HelpFeedbackVote;
};
