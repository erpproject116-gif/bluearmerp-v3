import { synonymsFor } from "./helpSynonyms";

const MIN_TOKEN_LEN = 2;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_TOKEN_LEN);
}

/** Query tokens plus synonym expansions (unique, lowercase). */
export function expandQueryTerms(query: string): string[] {
  const base = tokenize(query);
  const out = new Set<string>(base);
  for (const token of base) {
    for (const phrase of synonymsFor(token)) {
      for (const part of tokenize(phrase)) {
        out.add(part);
      }
    }
  }
  return [...out];
}
