import { getHelpChunks } from "./helpIndex";
import { routeTagsFromPath } from "./helpRouteContext";
import { expandQueryTerms, tokenize } from "./helpTokenize";
import type { HelpChunk, HelpSearchHit } from "./helpTypes";

const MIN_SCORE = 1.2;
const TITLE_WEIGHT = 4;
const SCENARIO_WEIGHT = 3;
const TAG_WEIGHT = 2.5;
const TEXT_WEIGHT = 1;
const ROUTE_BOOST = 2;
const PHRASE_BONUS = 3;

function tagMatches(term: string, tags: string[]): boolean {
  return tags.some((tag) => tag.includes(term) || term.includes(tag));
}

function scoreChunk(chunk: HelpChunk, terms: string[], phrase: string, routeTags: string[]): number {
  if (!terms.length) return 0;
  const title = chunk.title.toLowerCase();
  const scenario = (chunk.scenario ?? "").toLowerCase();
  const text = chunk.text.toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += TITLE_WEIGHT;
    if (scenario.includes(term)) score += SCENARIO_WEIGHT;
    if (tagMatches(term, chunk.moduleTags)) score += TAG_WEIGHT;
    if (text.includes(term)) score += TEXT_WEIGHT;
  }

  if (phrase.length >= 4) {
    if (title.includes(phrase) || scenario.includes(phrase) || text.includes(phrase)) {
      score += PHRASE_BONUS;
    }
  }

  for (const tag of routeTags) {
    if (chunk.moduleTags.includes(tag)) score += ROUTE_BOOST;
  }

  return score / terms.length;
}

function makeSnippet(chunk: HelpChunk, terms: string[], phrase: string): string {
  const raw = chunk.text.trim();
  if (!raw) {
    return chunk.steps?.[0] ?? chunk.scenario ?? chunk.title;
  }
  const lower = raw.toLowerCase();
  let idx = phrase.length >= 4 ? lower.indexOf(phrase) : -1;
  if (idx < 0) {
    for (const term of terms) {
      idx = lower.indexOf(term);
      if (idx >= 0) break;
    }
  }
  if (idx < 0) {
    return raw.length > 220 ? `${raw.slice(0, 217)}…` : raw;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(raw.length, idx + 180);
  let snippet = raw.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < raw.length) snippet = `${snippet}…`;
  return snippet;
}

export function searchHelp(query: string, pathname = "", limit = 3): HelpSearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const terms = expandQueryTerms(trimmed);
  const phrase = tokenize(trimmed).join(" ");
  const routeTags = routeTagsFromPath(pathname);

  const byArticle = new Map<string, HelpSearchHit>();
  for (const chunk of getHelpChunks()) {
    const score = scoreChunk(chunk, terms, phrase, routeTags);
    if (score < MIN_SCORE) continue;
    const hit: HelpSearchHit = { chunk, score, snippet: makeSnippet(chunk, terms, phrase) };
    const prev = byArticle.get(chunk.articleId);
    if (!prev || hit.score > prev.score) {
      byArticle.set(chunk.articleId, hit);
    }
  }

  return [...byArticle.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
