/** Client-side text extraction for Baiko attachments (reuses existing pdf/xlsx/docx deps). */

export type ExtractedAttachment = {
  name: string;
  mime: string;
  size: number;
  text: string;
  kind: "pdf" | "sheet" | "doc" | "image" | "text" | "other";
};

const MAX_CHARS = 24_000;
const MAX_BYTES = 8 * 1024 * 1024;

function truncate(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_CHARS) return t;
  return `${t.slice(0, MAX_CHARS)}\n\n…[truncated]`;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

async function extractPdf(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  const { default: pdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  GlobalWorkerOptions.workerSrc = pdfWorker;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  const parts: string[] = [];
  const pages = Math.min(doc.numPages, 20);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? String((it as { str: string }).str) : ""))
      .join(" ");
    if (line.trim()) parts.push(line);
  }
  return parts.join("\n");
}

async function extractSheet(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames.slice(0, 5)) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`## Sheet: ${name}\n${csv}`);
  }
  return parts.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value || "";
}

async function extractImageOcr(file: File): Promise<string> {
  try {
    const Tesseract = await import("tesseract.js");
    const result = await Tesseract.recognize(file, "eng");
    return result.data.text || "";
  } catch {
    return `[Image: ${file.name} — OCR unavailable]`;
  }
}

export async function extractAttachment(file: File): Promise<ExtractedAttachment> {
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (max ${MAX_BYTES / (1024 * 1024)} MB).`);
  }
  const ext = extOf(file.name);
  const mime = file.type || "application/octet-stream";
  let kind: ExtractedAttachment["kind"] = "other";
  let text = "";

  if (ext === "pdf" || mime === "application/pdf") {
    kind = "pdf";
    text = await extractPdf(file);
  } else if (["xlsx", "xls", "csv"].includes(ext) || mime.includes("sheet") || mime === "text/csv") {
    kind = "sheet";
    if (ext === "csv" || mime === "text/csv") {
      text = await file.text();
    } else {
      text = await extractSheet(file);
    }
  } else if (ext === "docx" || mime.includes("wordprocessingml")) {
    kind = "doc";
    text = await extractDocx(file);
  } else if (ext === "doc") {
    kind = "doc";
    text = `[Legacy .doc binary — convert to .docx or PDF for best results: ${file.name}]`;
  } else if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    kind = "image";
    text = await extractImageOcr(file);
  } else if (mime.startsWith("text/") || ["txt", "md", "json", "log"].includes(ext)) {
    kind = "text";
    text = await file.text();
  } else {
    kind = "other";
    text = `[Unsupported file type: ${file.name}. Try PDF, DOCX, XLSX, CSV, TXT, or an image.]`;
  }

  return {
    name: file.name,
    mime,
    size: file.size,
    text: truncate(text),
    kind,
  };
}
