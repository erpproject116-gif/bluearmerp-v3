import { searchHelp, searchHelpSuggestions } from "./helpSearch";
import type { HelpReply, HelpReplyHit } from "./helpTypes";

function hitsToReplyHits(hits: ReturnType<typeof searchHelp>): HelpReplyHit[] {
  return hits.map((h) => ({
    articleId: h.chunk.articleId,
    title: h.chunk.title,
    scenario: h.chunk.scenario,
    snippet: h.snippet,
    steps: h.chunk.steps?.slice(0, 5),
    articleHref: h.chunk.href,
    actionHref: h.chunk.actionHref,
    actionLabel: h.chunk.actionLabel,
  }));
}

export function composeHelpReply(query: string, pathname = ""): HelpReply {
  const hits = searchHelp(query, pathname, 3);
  const replyHits = hitsToReplyHits(hits);

  if (!replyHits.length) {
    const near = searchHelpSuggestions(query, pathname, 3);
    const suggestions = near.map((h) => h.chunk.title);
    return {
      query,
      hits: [],
      fallback: true,
      suggestions: suggestions.length ? suggestions : undefined,
      message: suggestions.length
        ? "I couldn't find an exact match. You could try one of these topics, or shorter terms like \"import rfq\", \"goods receipt\", or \"serial number\":"
        : "I couldn't find an exact match in the help library. Try shorter terms like \"import rfq\", \"goods receipt\", \"sales return\", or \"serial number\". You can also open Documentation → Knowledge base.",
    };
  }

  const count = replyHits.length;
  const noun = count === 1 ? "article" : "articles";
  return {
    query,
    hits: replyHits,
    fallback: false,
    message: `I found ${count} help ${noun} that may answer your question:`,
  };
}
