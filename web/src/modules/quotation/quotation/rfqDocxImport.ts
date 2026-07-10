import mammoth from "mammoth";
import type { RfqStructuredTable } from "./rfqSpreadsheetImport";
import { gridToStructuredTable } from "./rfqSpreadsheetImport";
import type { RfqOcrPage } from "./rfqDocumentOcr";

function cellText(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function htmlTablesToStructured(doc: Document, pageOffset: number): RfqStructuredTable[] {
  const tables: RfqStructuredTable[] = [];
  let page = pageOffset;
  for (const tableEl of doc.querySelectorAll("table")) {
    const grid: string[][] = [];
    for (const tr of tableEl.querySelectorAll("tr")) {
      const cells = tr.querySelectorAll("th, td");
      if (!cells.length) continue;
      grid.push(Array.from(cells, (c) => cellText(c)));
    }
    page += 1;
    const parsed = gridToStructuredTable(grid, page);
    if (parsed) tables.push(parsed);
  }
  return tables;
}

export function isDocxFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export function isLegacyDocFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".doc") && !lower.endsWith(".docx");
}

export async function extractDocxContent(
  file: File,
  pageOffset = 0,
): Promise<{ pages: RfqOcrPage[]; tables: RfqStructuredTable[] }> {
  const buf = await file.arrayBuffer();
  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ arrayBuffer: buf }),
    mammoth.extractRawText({ arrayBuffer: buf }),
  ]);

  const doc = new DOMParser().parseFromString(htmlResult.value || "<div></div>", "text/html");
  const tables = htmlTablesToStructured(doc, pageOffset);

  const pages: RfqOcrPage[] = [];
  const plain = (textResult.value ?? "").trim();
  if (plain && tables.length === 0) {
    pages.push({
      page: pageOffset + 1,
      text: plain,
      words: [],
      width: 612,
      height: 792,
    });
  }

  return { pages, tables };
}
