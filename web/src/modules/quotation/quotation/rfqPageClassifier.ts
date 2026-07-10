import type { RfqOcrPage } from "./rfqDocumentOcr";

export type RfqPageKind = "table" | "skip" | "unknown";

const HEADER_HINT =
  /\b(item|qty|quantity|description|spec|specification|unit|price|cost|amount|code|sku|part|uom|no\.|line|brand|model|unit\s*price|line\s*total|boq|bill\s+of\s+quantities|schedule\s+of\s+requirements|reference\s+price|budget)\b/i;

const COVER_HINT =
  /\b(request for quotation|^rfq\b|invitation to (bid|quote)|terms and conditions|general conditions|certificate of|this page intentionally|table of contents|instruction to bidders|eligible|warranty period|delivery period|payment terms|validity of offer|scope of work|background of the|organizational chart|company profile|notary|acknowledgement)\b/i;

const FOOTER_ONLY = /^(grand\s+total|sub\s*total|subtotal|total\s+amount|prepared\s+by|approved\s+by|noted\s+by|conforme)/i;

/** 0–100 likelihood this page is part of a line-item BOQ / data grid. */
export function scoreRfqPageTable(page: Pick<RfqOcrPage, "text" | "words">): number {
  const text = (page.text ?? "").trim();
  const lower = text.toLowerCase();
  const words = page.words ?? [];
  const wordCount = words.length;

  if (!text && wordCount < 4) return 0;

  let score = 0;
  const headerHits = (text.match(new RegExp(HEADER_HINT.source, "gi")) ?? []).length;
  const hasQty = /\b(qty|quantity|q'ty)\b/i.test(text) || /\b\d+(?:\.\d+)?\s*(pcs|pc|ea|set|units|unit|lot|box|pack)\b/i.test(text);
  const hasMoney = /\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/.test(text) || /₱|\$|php\b/i.test(text);
  const hasLineNo = /^\s*\d{1,3}[\s.)]/m.test(text);
  const rowCount = countTextRows(text);
  const multiColumn = rowCount >= 3 && text.split(/\s{2,}|\t/).filter(Boolean).length >= 3;
  const digitRows = text.split("\n").filter((l) => /^\s*\d{1,3}[\s.)]/.test(l)).length;

  score += Math.min(headerHits * 12, 36);
  if (hasQty) score += 18;
  if (hasMoney) score += 12;
  if (hasLineNo) score += 14;
  if (multiColumn) score += 16;
  if (digitRows >= 2) score += Math.min(digitRows * 4, 20);
  if (wordCount >= 12) score += 8;

  if (FOOTER_ONLY.test(lower.trim())) score -= 40;
  if (COVER_HINT.test(lower) && headerHits === 0 && !hasQty && digitRows === 0) score -= 30;
  if (wordCount < 6 && !hasQty && headerHits === 0) score -= 25;
  if (text.length > 0 && text.length < 80 && headerHits === 0) score -= 15;

  return Math.max(0, Math.min(100, score));
}

/** Classify a page before expensive OCR — table pages are kept; skip cover/terms-only pages. */
export function classifyRfqPage(page: Pick<RfqOcrPage, "text" | "words">): RfqPageKind {
  const score = scoreRfqPageTable(page);
  if (score >= 45) return "table";
  if (score <= 12) return "skip";
  return "unknown";
}

function countTextRows(text: string): number {
  return text.split("\n").filter((l) => l.trim().length > 0).length;
}

/**
 * Keep only pages that belong to the line-item table / BOQ grid.
 * Drops cover, terms, and narrative pages before/after the table block.
 */
export function focusTablePages(
  pages: RfqOcrPage[],
  enabled: boolean,
): { kept: RfqOcrPage[]; skipped: number; tablePages: number } {
  if (!enabled || pages.length <= 2) {
    return { kept: pages, skipped: 0, tablePages: pages.length };
  }

  const kinds = pages.map((p) => classifyRfqPage(p));
  const scores = pages.map((p) => scoreRfqPageTable(p));

  let firstTable = kinds.findIndex((k) => k === "table");
  if (firstTable < 0) {
    let bestIdx = 0;
    let bestScore = scores[0] ?? 0;
    for (let i = 1; i < scores.length; i++) {
      if ((scores[i] ?? 0) > bestScore) {
        bestScore = scores[i] ?? 0;
        bestIdx = i;
      }
    }
    if (bestScore >= 30) firstTable = bestIdx;
  }

  if (firstTable < 0) {
    return { kept: pages, skipped: 0, tablePages: 0 };
  }

  let lastTable = firstTable;
  for (let i = firstTable; i < pages.length; i++) {
    if (kinds[i] === "table") lastTable = i;
    else if (kinds[i] === "unknown" && i <= lastTable + 2 && (scores[i] ?? 0) >= 25) {
      lastTable = i;
    } else if (kinds[i] === "skip" && i > lastTable + 1) {
      break;
    } else if (i > lastTable + 1 && (scores[i] ?? 0) < 20) {
      break;
    }
  }

  const kept: RfqOcrPage[] = [];
  let skipped = 0;
  let tablePages = 0;

  for (let i = 0; i < pages.length; i++) {
    if (i < firstTable || i > lastTable) {
      skipped++;
      continue;
    }
    if (kinds[i] === "skip" && (scores[i] ?? 0) < 25) {
      skipped++;
      continue;
    }
    kept.push(pages[i]);
    if (kinds[i] === "table" || (scores[i] ?? 0) >= 35) tablePages++;
  }

  return { kept, skipped, tablePages };
}

export function filterPagesByClassification(
  pages: RfqOcrPage[],
  enabled: boolean,
): { kept: RfqOcrPage[]; skipped: number } {
  const { kept, skipped } = focusTablePages(pages, enabled);
  return { kept, skipped };
}

export function applyPageRange(pages: RfqOcrPage[], from?: number, to?: number): RfqOcrPage[] {
  if (!from && !to) return pages;
  return pages.filter((p) => {
    if (from && p.page < from) return false;
    if (to && p.page > to) return false;
    return true;
  });
}
