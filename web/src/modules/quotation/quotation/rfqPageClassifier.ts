import type { RfqOcrPage } from "./rfqDocumentOcr";

export type RfqPageKind = "table" | "skip" | "unknown";

const HEADER_HINT =
  /\b(item|qty|quantity|description|spec|unit|price|cost|amount|code|sku|part|uom|no\.|line)\b/i;

const COVER_HINT =
  /\b(request for quotation|^rfq\b|invitation to (bid|quote)|terms and conditions|general conditions|certificate of|this page intentionally|table of contents)\b/i;

const FOOTER_ONLY = /^(grand\s+total|sub\s*total|subtotal|total\s+amount|prepared\s+by|approved\s+by)/i;

/** Classify a page before expensive OCR — table pages are kept; skip cover/terms-only pages. */
export function classifyRfqPage(page: Pick<RfqOcrPage, "text" | "words">): RfqPageKind {
  const text = (page.text ?? "").trim();
  const lower = text.toLowerCase();
  const words = page.words ?? [];
  const wordCount = words.length;

  if (!text && wordCount < 4) return "skip";

  const headerHits = (text.match(new RegExp(HEADER_HINT.source, "gi")) ?? []).length;
  const hasQty = /\b(qty|quantity|q'ty)\b/i.test(text) || /\b\d+(?:\.\d+)?\s*(pcs|pc|ea|set|units|unit|lot)\b/i.test(text);
  const hasMoney = /\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/.test(text) || /₱|\$|php\b/i.test(text);
  const hasLineNo = /^\s*\d{1,3}[\s.)]/m.test(text);
  const multiColumn = countTextRows(text) >= 3 && text.split(/\s{2,}|\t/).filter(Boolean).length >= 3;

  if (headerHits >= 2) return "table";
  if ((hasQty || hasMoney) && (hasLineNo || wordCount >= 10 || multiColumn)) return "table";
  if (wordCount >= 15 && (hasQty || hasMoney)) return "table";

  if (FOOTER_ONLY.test(lower.trim())) return "skip";

  if (COVER_HINT.test(lower) && headerHits === 0 && !hasQty && !hasMoney) {
    if (text.length < 400 || wordCount < 20) return "skip";
  }

  if (wordCount < 8 && !hasQty && !hasMoney && headerHits === 0) {
    if (text.length < 120) return "skip";
  }

  if (wordCount < 4 && text.length < 80) return "skip";

  return "unknown";
}

function countTextRows(text: string): number {
  return text.split("\n").filter((l) => l.trim().length > 0).length;
}

export function filterPagesByClassification(
  pages: RfqOcrPage[],
  enabled: boolean,
): { kept: RfqOcrPage[]; skipped: number } {
  if (!enabled || pages.length <= 3) {
    return { kept: pages, skipped: 0 };
  }

  const kept: RfqOcrPage[] = [];
  let skipped = 0;
  let seenTable = false;

  for (const page of pages) {
    const kind = classifyRfqPage(page);
    if (kind === "table") {
      seenTable = true;
      kept.push(page);
      continue;
    }
    if (kind === "skip") {
      if (!seenTable || FOOTER_ONLY.test(page.text.trim().toLowerCase())) {
        skipped++;
        continue;
      }
    }
    kept.push(page);
  }

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
