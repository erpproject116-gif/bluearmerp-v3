import { searchHelp } from "./helpSearch";
import type { HelpReply, HelpReplyHit } from "./helpTypes";

function hitsToReplyHits(hits: ReturnType<typeof searchHelp>): HelpReplyHit[] {
  return hits.map((h) => ({
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
    return {
      query,
      hits: [],
      fallback: true,
      message:
        "I couldn't find an exact match in the help library. Try shorter terms like \"import rfq\", \"goods receipt\", \"sales return\", or \"serial number\". You can also open Documentation → Knowledge base.",
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
