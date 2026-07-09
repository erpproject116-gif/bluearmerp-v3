import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";

GlobalWorkerOptions.workerSrc = pdfWorker;

export type RfqOcrPage = {
  page: number;
  text: string;
};

export type RfqOcrProgress = {
  phase: "pdf" | "ocr" | "parse";
  page: number;
  totalPages: number;
  message: string;
};

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isImage(file: File) {
  return IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
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

async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onStatus?: (msg: string) => void,
): Promise<string> {
  const worker = await createWorker("eng");
  try {
    onStatus?.("Recognizing text…");
    const { data } = await worker.recognize(canvas);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

async function ocrImageFile(file: File, onStatus?: (msg: string) => void): Promise<string> {
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
    let text = (await page.getTextContent())
      .items.map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .trim();

    if (text.length < 40) {
      onProgress?.({
        phase: "ocr",
        page: pageOffset + i,
        totalPages: pageOffset + pdf.numPages,
        message: `OCR on PDF page ${i}…`,
      });
      const canvas = await renderPdfPageToCanvas(page);
      text = await ocrCanvas(canvas);
    }
    pages.push({ page: pageOffset + i, text });
  }
  return pages;
}

/** Extract text from RFQ PDFs and images, page by page (OCR when needed). */
export async function extractRfqDocumentPages(
  files: File[],
  onProgress?: (p: RfqOcrProgress) => void,
): Promise<RfqOcrPage[]> {
  const pages: RfqOcrPage[] = [];
  let pageOffset = 0;
  for (const file of files) {
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
      const text = await ocrImageFile(file, (msg) =>
        onProgress?.({ phase: "ocr", page: pageOffset, totalPages: pageOffset, message: msg }),
      );
      pages.push({ page: pageOffset, text });
      continue;
    }
    throw new Error(`Unsupported file type: ${file.name}. Use PDF or image files.`);
  }
  return pages;
}
