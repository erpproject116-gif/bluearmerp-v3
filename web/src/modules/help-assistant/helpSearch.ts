import { getHelpChunks } from "./helpIndex";
import { routeTagsFromPath } from "./helpRouteContext";
import { expandQueryTerms, tokenize } from "./helpTokenize";
import type { HelpChunk, HelpSearchHit } from "./helpTypes";

const MIN_SCORE = 1.15;
const TITLE_WEIGHT = 4;
const SCENARIO_WEIGHT = 3;
const QUESTION_WEIGHT = 5;
const ERROR_WEIGHT = 8;
const TAG_WEIGHT = 2.5;
const TEXT_WEIGHT = 1;
const ROUTE_BOOST = 2;
const PHRASE_BONUS = 3;
const KB_SOURCE_BONUS = 1.25;

function tagMatches(term: string, tags: string[]): boolean {
  return tags.some((tag) => tag.includes(term) || term.includes(tag));
}

function listBlob(items?: string[]): string {
  return (items ?? []).join(" \n ").toLowerCase();
}

function errorPhraseHit(queryLower: string, phrases?: string[]): boolean {
  if (!phrases?.length) return false;
  for (const raw of phrases) {
    const p = raw.toLowerCase().trim();
    if (p.length < 4) continue;
    if (queryLower.includes(p) || p.includes(queryLower)) return true;
  }
  return false;
}

function questionHit(terms: string[], phrase: string, questions?: string[]): number {
  if (!questions?.length) return 0;
  let best = 0;
  for (const q of questions) {
    const ql = q.toLowerCase();
    let local = 0;
    if (phrase.length >= 4 && ql.includes(phrase)) local += QUESTION_WEIGHT * 1.5;
    for (const term of terms) {
      if (ql.includes(term)) local += QUESTION_WEIGHT;
    }
    if (local > best) best = local;
  }
  return best;
}

function scoreChunk(chunk: HelpChunk, terms: string[], phrase: string, queryLower: string, routeTags: string[]): number {
  if (!terms.length) return 0;
  const title = chunk.title.toLowerCase();
  const scenario = (chunk.scenario ?? "").toLowerCase();
  const text = chunk.text.toLowerCase();
  const questionsBlob = listBlob(chunk.questions);

  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += TITLE_WEIGHT;
    if (scenario.includes(term)) score += SCENARIO_WEIGHT;
    if (questionsBlob.includes(term)) score += QUESTION_WEIGHT * 0.35;
    if (tagMatches(term, chunk.moduleTags)) score += TAG_WEIGHT;
    if (text.includes(term)) score += TEXT_WEIGHT;
  }

  score += questionHit(terms, phrase, chunk.questions);

  if (errorPhraseHit(queryLower, chunk.errorPhrases)) {
    score += ERROR_WEIGHT * Math.max(terms.length, 1);
  }

  if (phrase.length >= 4) {
    if (
      title.includes(phrase) ||
      scenario.includes(phrase) ||
      text.includes(phrase) ||
      questionsBlob.includes(phrase)
    ) {
      score += PHRASE_BONUS;
    }
  }

  for (const tag of routeTags) {
    if (chunk.moduleTags.includes(tag)) score += ROUTE_BOOST;
  }

  if (chunk.source === "kb") score += KB_SOURCE_BONUS;

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

function compareHits(a: HelpSearchHit, b: HelpSearchHit): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.chunk.source !== b.chunk.source) return a.chunk.source === "kb" ? -1 : 1;
  const aSc = a.chunk.scenario ? 1 : 0;
  const bSc = b.chunk.scenario ? 1 : 0;
  return bSc - aSc;
}

export function searchHelp(query: string, pathname = "", limit = 3, minScore = MIN_SCORE): HelpSearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const terms = expandQueryTerms(trimmed);
  const phrase = tokenize(trimmed).join(" ");
  const queryLower = trimmed.toLowerCase();
  const routeTags = routeTagsFromPath(pathname);

  const byArticle = new Map<string, HelpSearchHit>();
  for (const chunk of getHelpChunks()) {
    const score = scoreChunk(chunk, terms, phrase, queryLower, routeTags);
    if (score < minScore) continue;
    const hit: HelpSearchHit = { chunk, score, snippet: makeSnippet(chunk, terms, phrase) };
    const prev = byArticle.get(chunk.articleId);
    if (!prev || hit.score > prev.score) {
      byArticle.set(chunk.articleId, hit);
    }
  }

  return [...byArticle.values()].sort(compareHits).slice(0, limit);
}

/** Lower-threshold search for “Did you mean” suggestions when primary search is empty. */
export function searchHelpSuggestions(query: string, pathname = "", limit = 3): HelpSearchHit[] {
  return searchHelp(query, pathname, limit, 0.55);
}
