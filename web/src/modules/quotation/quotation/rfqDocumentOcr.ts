import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker, OEM, type Worker } from "tesseract.js";
import tessWorkerUrl from "tesseract.js/dist/worker.min.js?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

export type RfqOcrWord = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RfqOcrPage = {
  page: number;
  /** Plain text fallback for legacy line parser. */
  text: string;
  words: RfqOcrWord[];
  width: number;
  height: number;
  /** Index in the upload batch (matches fileImportKey order). */
  source_file_index?: number;
  /** 1-based page in the source PDF, or 1 for single images. */
  source_pdf_page?: number;
};

export type RfqOcrProgress = {
  phase: "pdf" | "ocr" | "parse" | "scan";
  page: number;
  totalPages: number;
  message: string;
};

export type RfqExtractOptions = {
  /** 1-based first page to process (inclusive). */
  pageFrom?: number;
  /** 1-based last page to process (inclusive). */
  pageTo?: number;
  /** Skip cover/terms pages when document has more than 3 pages. */
  filterNonTablePages?: boolean;
  /** Per-file selected Excel sheet names (key = fileKey from fileImportKey). */
  sheetSelections?: Record<string, string[]>;
  /** Index of the file within the upload batch. */
  fileIndex?: number;
};

export function fileImportKey(file: File, index: number): string {
  return `${file.name}::${index}`;
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

let ocrWorkerPromise: Promise<Worker> | null = null;

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isImage(file: File) {
  return IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    // Prefer self-hosted assets under /tess (see web/public/tess/README.md).
    // Falls back to bundled worker URL; core/lang must still be served from /tess.
    ocrWorkerPromise = createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: tessWorkerUrl,
      workerBlobURL: false,
      corePath: "/tess/tesseract-core",
      langPath: "/tess/lang",
    });
  }
  return ocrWorkerPromise;
}

async function shutdownOcrWorker() {
  if (ocrWorkerPromise) {
    const worker = await ocrWorkerPromise;
    await worker.terminate();
    ocrWorkerPromise = null;
  }
}

type OcrWordsResult = { text: string; words: RfqOcrWord[]; width: number; height: number };

async function ocrCanvas(canvas: HTMLCanvasElement, onStatus?: (msg: string) => void): Promise<OcrWordsResult> {
  const worker = await getOcrWorker();
  onStatus?.("Recognizing text…");
  const { data } = await worker.recognize(canvas);
  const words: RfqOcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          const t = w.text?.trim();
          if (!t) continue;
          words.push({
            text: t,
            x: w.bbox.x0,
            y: w.bbox.y0,
            w: Math.max(1, w.bbox.x1 - w.bbox.x0),
            h: Math.max(1, w.bbox.y1 - w.bbox.y0),
          });
        }
      }
    }
  }
  return {
    text: data.text ?? "",
    words: mergeNearbyWords(words),
    width: canvas.width,
    height: canvas.height,
  };
}

async function ocrImageFile(file: File, onStatus?: (msg: string) => void): Promise<OcrWordsResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    ctx.drawImage(img, 0, 0);
    return await ocrCanvas(canvas, onStatus);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderPdfPageToCanvas(page: import("pdfjs-dist").PDFPageProxy): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

function mergeNearbyWords(words: RfqOcrWord[]): RfqOcrWord[] {
  if (words.length < 2) return words;
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const avgH = sorted.reduce((s, w) => s + (w.h || 10), 0) / sorted.length;
  const rowTol = Math.max(6, avgH * 0.55);
  const gapTol = Math.max(4, avgH * 0.35);
  const out: RfqOcrWord[] = [];
  for (const w of sorted) {
    const t = w.text.trim();
    if (!t) continue;
    const word = { ...w, text: t };
    const last = out[out.length - 1];
    if (last) {
      const sameRow = Math.abs(word.y - last.y) <= rowTol;
      const gap = word.x - (last.x + last.w);
      if (sameRow && gap >= -1 && gap <= gapTol) {
        last.text = gap > Math.max(3, gapTol * 0.6) ? `${last.text} ${word.text}` : `${last.text}${word.text}`;
        last.w = word.x + word.w - last.x;
        last.h = Math.max(last.h, word.h);
        continue;
      }
    }
    out.push(word);
  }
  return out;
}

function extractPdfWords(
  page: import("pdfjs-dist").PDFPageProxy,
  textContent: Awaited<ReturnType<import("pdfjs-dist").PDFPageProxy["getTextContent"]>>,
): RfqOcrWord[] {
  const viewport = page.getViewport({ scale: 1 });
  const pageH = viewport.height;
  const words: RfqOcrWord[] = [];

  for (const item of textContent.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const tx = item.transform;
    const x = tx[4];
    const pdfY = tx[5];
    const yTop = pageH - pdfY - (item.height ?? 10);
    words.push({
      text: item.str.trim(),
      x,
      y: yTop,
      w: Math.max(1, item.width ?? 10),
      h: Math.max(1, item.height ?? 10),
    });
  }
  return mergeNearbyWords(words);
}

function wordsToPlainText(words: RfqOcrWord[]): string {
  if (!words.length) return "";
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: string[] = [];
  let row: RfqOcrWord[] = [];
  let rowY = sorted[0].y;
  const rowTol = Math.max(4, sorted[0].h * 0.6);

  const flush = () => {
    if (!row.length) return;
    row.sort((a, b) => a.x - b.x);
    lines.push(row.map((w) => w.text).join(" "));
    row = [];
  };

  for (const w of sorted) {
    if (Math.abs(w.y - rowY) > rowTol) {
      flush();
      rowY = w.y;
    }
    row.push(w);
  }
  flush();
  return lines.join("\n");
}

async function extractPdfPages(
  file: File,
  onProgress?: (p: RfqOcrProgress) => void,
  pageOffset = 0,
  options: RfqExtractOptions = {},
): Promise<RfqOcrPage[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const from = Math.max(1, options.pageFrom ?? 1);
  const to = Math.min(pdf.numPages, options.pageTo ?? pdf.numPages);
  if (from > to) return [];

  const { classifyRfqPage, focusTablePages } = await import("./rfqPageClassifier");
  const useFilter = options.filterNonTablePages !== false && to - from + 1 > 2;

  type PagePreview = { pdfIndex: number; preview: { text: string; words: RfqOcrPage["words"] } };
  const previews: PagePreview[] = [];

  for (let i = from; i <= to; i++) {
    onProgress?.({
      phase: "scan",
      page: pageOffset + (i - from + 1),
      totalPages: pageOffset + (to - from + 1),
      message: `Scanning page ${i} of ${pdf.numPages} for line-item tables…`,
    });
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const words = extractPdfWords(page, textContent);
    const text = wordsToPlainText(words);
    previews.push({ pdfIndex: i, preview: { text, words } });
  }

  let plan = previews;
  if (useFilter) {
    const pseudoPages = previews.map((p, idx) => ({
      page: pageOffset + idx + 1,
      text: p.preview.text,
      words: p.preview.words,
      width: 0,
      height: 0,
    }));
    const { kept, skipped } = focusTablePages(pseudoPages, true);
    const keptSet = new Set(kept.map((k) => k.page));
    plan = previews.filter((_, idx) => keptSet.has(pageOffset + idx + 1));
    if (plan.length === 0 && previews.length > 0) {
      plan = previews.filter((p) => classifyRfqPage(p.preview) !== "skip");
    }
    if (skipped > 0) {
      onProgress?.({
        phase: "scan",
        page: plan.length,
        totalPages: previews.length,
        message: `Focused on ${plan.length} table page(s); ${skipped} non-table page(s) skipped.`,
      });
    }
  }

  const pages: RfqOcrPage[] = [];
  for (let pi = 0; pi < plan.length; pi++) {
    const { pdfIndex: i } = plan[pi];
    onProgress?.({
      phase: "pdf",
      page: pageOffset + pi + 1,
      totalPages: pageOffset + plan.length,
      message: `Reading PDF page ${i} of ${pdf.numPages}…`,
    });
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    let words = extractPdfWords(page, textContent);
    let text = wordsToPlainText(words);

    if (words.length < 8) {
      onProgress?.({
        phase: "ocr",
        page: pageOffset + pi + 1,
        totalPages: pageOffset + plan.length,
        message: `OCR on PDF page ${i}…`,
      });
      const canvas = await renderPdfPageToCanvas(page);
      const ocr = await ocrCanvas(canvas);
      words = ocr.words;
      text = ocr.text || wordsToPlainText(words);
      pages.push({
        page: pageOffset + pi + 1,
        text,
        words,
        width: ocr.width,
        height: ocr.height,
        source_file_index: options.fileIndex,
        source_pdf_page: i,
      });
      continue;
    }

    pages.push({
      page: pageOffset + pi + 1,
      text,
      words,
      width: viewport.width,
      height: viewport.height,
      source_file_index: options.fileIndex,
      source_pdf_page: i,
    });
  }
  return pages;
}

/** Returns total page count for a PDF without full extraction. */
export async function getPdfPageCount(file: File): Promise<number> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  return pdf.numPages;
}

export type RfqPageImageForAI = {
  page: number;
  image_base64: string;
  mime: string;
};

async function canvasToJpegBase64(canvas: HTMLCanvasElement, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode page image."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result ?? "");
          const comma = dataUrl.indexOf(",");
          resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
        };
        reader.onerror = () => reject(new Error("Could not read page image."));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function renderImageFileToJpegBase64(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not load image ${file.name}.`));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    ctx.drawImage(img, 0, 0);
    return canvasToJpegBase64(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const pdfDocCache = new Map<string, Promise<import("pdfjs-dist").PDFDocumentProxy>>();

async function loadPdfDocument(file: File): Promise<import("pdfjs-dist").PDFDocumentProxy> {
  const key = `${file.name}::${file.size}::${file.lastModified}`;
  let pending = pdfDocCache.get(key);
  if (!pending) {
    pending = (async () => {
      const data = new Uint8Array(await file.arrayBuffer());
      return getDocument({ data }).promise;
    })();
    pdfDocCache.set(key, pending);
  }
  return pending;
}

/** Render table pages to JPEG base64 for OpenRouter vision extraction. */
export async function renderRfqPageImagesForAI(
  files: File[],
  pages: RfqOcrPage[],
  maxPages: number,
  onProgress?: (message: string) => void,
): Promise<RfqPageImageForAI[]> {
  const cap = Math.max(1, maxPages);
  const targets = pages.slice(0, cap);
  const out: RfqPageImageForAI[] = [];

  for (let i = 0; i < targets.length; i++) {
    const pg = targets[i];
    const fileIdx = pg.source_file_index ?? 0;
    const file = files[fileIdx];
    if (!file) continue;

    onProgress?.(`Rendering page ${i + 1} of ${targets.length} for AI…`);

    if (isImage(file)) {
      const image_base64 = await renderImageFileToJpegBase64(file);
      out.push({ page: pg.page, image_base64, mime: "image/jpeg" });
      continue;
    }
    if (!isPdf(file)) continue;

    const pdfPage = pg.source_pdf_page ?? pg.page;
    const pdf = await loadPdfDocument(file);
    if (pdfPage < 1 || pdfPage > pdf.numPages) continue;
    const page = await pdf.getPage(pdfPage);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const image_base64 = await canvasToJpegBase64(canvas);
    out.push({ page: pg.page, image_base64, mime: "image/jpeg" });
  }

  return out;
}

/** Payload sent to RFQ parse API (PDF/images + structured spreadsheet/word tables). */
export type RfqDocumentPayload = {
  pages: RfqOcrPage[];
  tables: import("./rfqSpreadsheetImport").RfqStructuredTable[];
  /** Pages skipped by classifier (cover/terms). */
  skippedPages?: number;
  /** Pages classified as line-item table / BOQ grid. */
  tablePages?: number;
  /** Original document page count before filtering. */
  sourcePageCount?: number;
};

/** Extract positioned words, plain text, and structured tables from RFQ uploads. */
export async function extractRfqDocumentPayload(
  files: File[],
  onProgress?: (p: RfqOcrProgress) => void,
  options: RfqExtractOptions = {},
): Promise<RfqDocumentPayload> {
  onProgress?.({ phase: "ocr", page: 0, totalPages: 0, message: "Preparing document reader…" });
  const { isSpreadsheetFile, extractSpreadsheetTables } = await import("./rfqSpreadsheetImport");
  const { isDocxFile, isLegacyDocFile, extractDocxContent } = await import("./rfqDocxImport");

  try {
    const pages: RfqOcrPage[] = [];
    const tables: RfqDocumentPayload["tables"] = [];
    let pageOffset = 0;
    let skippedPages = 0;
    let sourcePageCount = 0;

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const fileKey = fileImportKey(file, fi);
      if (isLegacyDocFile(file)) {
        throw new Error(
          `${file.name}: Legacy Word (.doc) is not supported. Save as .docx, .pdf, or .xlsx and try again.`,
        );
      }
      if (isSpreadsheetFile(file)) {
        onProgress?.({
          phase: "parse",
          page: pageOffset,
          totalPages: pageOffset,
          message: `Reading spreadsheet ${file.name}…`,
        });
        const sheetTables = await extractSpreadsheetTables(file, {
          pageOffset,
          selectedSheets: options.sheetSelections?.[fileKey],
        });
        if (!sheetTables.length) {
          throw new Error(`${file.name}: No line-item table found in spreadsheet.`);
        }
        tables.push(...sheetTables);
        pageOffset += sheetTables.length;
        continue;
      }
      if (isDocxFile(file)) {
        onProgress?.({
          phase: "parse",
          page: pageOffset,
          totalPages: pageOffset,
          message: `Reading Word document ${file.name}…`,
        });
        const docx = await extractDocxContent(file, pageOffset);
        pages.push(...docx.pages);
        tables.push(...docx.tables);
        pageOffset += Math.max(docx.pages.length, docx.tables.length);
        continue;
      }
      if (isPdf(file)) {
        const pdfTotal = await getPdfPageCount(file);
        const from = options.pageFrom ?? 1;
        const to = options.pageTo ?? pdfTotal;
        sourcePageCount += Math.max(0, to - from + 1);
        const rangeCount = to - from + 1;
        const before = pageOffset;

        const { RFQ_CLIENT_OCR_PAGE_MAX } = await import("./rfqImportPipeline");

        if (rangeCount > RFQ_CLIENT_OCR_PAGE_MAX) {
          onProgress?.({
            phase: "parse",
            page: 0,
            totalPages: rangeCount,
            message: `Large PDF (${rangeCount} pages) — extracting on server…`,
          });
          const { extractPdfOnServer } = await import("./rfqPdfServer");
          const server = await extractPdfOnServer(
            file,
            {
              pageFrom: from,
              pageTo: to,
              filterNonTablePages: options.filterNonTablePages !== false,
            },
            onProgress,
          );
          if (server.emptyTextPages > 0 && server.pages.length === 0) {
            throw new Error(
              `${file.name}: Server found no readable text (likely scanned pages). ` +
                `Use a page range of at most ${RFQ_CLIENT_OCR_PAGE_MAX} pages so browser OCR can run, ` +
                `or export those pages as images and import them.`,
            );
          }
          if (server.emptyTextPages > server.pages.length / 2) {
            onProgress?.({
              phase: "parse",
              page: server.pages.length,
              totalPages: server.pages.length,
              message:
                `${server.emptyTextPages} page(s) had no text layer — server OCR is not available. ` +
                `Re-import with a page range ≤ ${RFQ_CLIENT_OCR_PAGE_MAX} for browser OCR.`,
            });
          }
          const offsetPages = server.pages.map((p, i) => ({
            ...p,
            page: pageOffset + i + 1,
            source_file_index: fi,
            source_pdf_page: p.source_pdf_page ?? p.page,
          }));
          pages.push(...offsetPages);
          skippedPages += server.skippedPages;
          pageOffset = before + offsetPages.length;
          continue;
        }

        const pdfPages = await extractPdfPages(file, onProgress, pageOffset, { ...options, fileIndex: fi });
        skippedPages += Math.max(0, to - from + 1 - pdfPages.length);
        pages.push(...pdfPages);
        pageOffset = before + pdfPages.length;
        continue;
      }
      if (isImage(file)) {
        pageOffset += 1;
        sourcePageCount += 1;
        onProgress?.({
          phase: "ocr",
          page: pageOffset,
          totalPages: pageOffset,
          message: `OCR image ${file.name}…`,
        });
        const ocr = await ocrImageFile(file, (msg) =>
          onProgress?.({ phase: "ocr", page: pageOffset, totalPages: pageOffset, message: msg }),
        );
        pages.push({
          page: pageOffset,
          text: ocr.text || wordsToPlainText(ocr.words),
          words: ocr.words,
          width: ocr.width,
          height: ocr.height,
          source_file_index: fi,
          source_pdf_page: 1,
        });
        continue;
      }
      throw new Error(
        `Unsupported file: ${file.name}. Use PDF, images, Excel (.xlsx/.xls), CSV, or Word (.docx).`,
      );
    }
    return { pages, tables, skippedPages, tablePages: pages.length + tables.length, sourcePageCount: sourcePageCount || pages.length + tables.length };
  } finally {
    await shutdownOcrWorker();
  }
}

/** @deprecated Use extractRfqDocumentPayload */
export async function extractRfqDocumentPages(
  files: File[],
  onProgress?: (p: RfqOcrProgress) => void,
): Promise<RfqOcrPage[]> {
  const payload = await extractRfqDocumentPayload(files, onProgress);
  return payload.pages;
}
