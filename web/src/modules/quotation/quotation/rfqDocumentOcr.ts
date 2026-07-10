import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker, OEM, type Worker } from "tesseract.js";
import tessWorkerUrl from "tesseract.js/dist/worker.min.js?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

const TESS_CORE_VERSION = "7.0.0";

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
};

export type RfqOcrProgress = {
  phase: "pdf" | "ocr" | "parse";
  page: number;
  totalPages: number;
  message: string;
};

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
    ocrWorkerPromise = createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: tessWorkerUrl,
      workerBlobURL: false,
      corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@v${TESS_CORE_VERSION}`,
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
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
    words,
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
  return words;
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
): Promise<RfqOcrPage[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const pages: RfqOcrPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({
      phase: "pdf",
      page: pageOffset + i,
      totalPages: pageOffset + pdf.numPages,
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
        page: pageOffset + i,
        totalPages: pageOffset + pdf.numPages,
        message: `OCR on PDF page ${i}…`,
      });
      const canvas = await renderPdfPageToCanvas(page);
      const ocr = await ocrCanvas(canvas);
      words = ocr.words;
      text = ocr.text || wordsToPlainText(words);
      pages.push({
        page: pageOffset + i,
        text,
        words,
        width: ocr.width,
        height: ocr.height,
      });
      continue;
    }

    pages.push({
      page: pageOffset + i,
      text,
      words,
      width: viewport.width,
      height: viewport.height,
    });
  }
  return pages;
}

/** Payload sent to RFQ parse API (PDF/images + structured spreadsheet/word tables). */
export type RfqDocumentPayload = {
  pages: RfqOcrPage[];
  tables: import("./rfqSpreadsheetImport").RfqStructuredTable[];
};

/** Extract positioned words, plain text, and structured tables from RFQ uploads. */
export async function extractRfqDocumentPayload(
  files: File[],
  onProgress?: (p: RfqOcrProgress) => void,
): Promise<RfqDocumentPayload> {
  onProgress?.({ phase: "ocr", page: 0, totalPages: 0, message: "Preparing document reader…" });
  const { isSpreadsheetFile, extractSpreadsheetTables } = await import("./rfqSpreadsheetImport");
  const { isDocxFile, isLegacyDocFile, extractDocxContent } = await import("./rfqDocxImport");

  try {
    const pages: RfqOcrPage[] = [];
    const tables: RfqDocumentPayload["tables"] = [];
    let pageOffset = 0;

    for (const file of files) {
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
        const sheetTables = await extractSpreadsheetTables(file, pageOffset);
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
        const pdfPages = await extractPdfPages(file, onProgress, pageOffset);
        pages.push(...pdfPages);
        pageOffset += pdfPages.length;
        continue;
      }
      if (isImage(file)) {
        pageOffset += 1;
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
        });
        continue;
      }
      throw new Error(
        `Unsupported file: ${file.name}. Use PDF, images, Excel (.xlsx/.xls), CSV, or Word (.docx).`,
      );
    }
    return { pages, tables };
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
