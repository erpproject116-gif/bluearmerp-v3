import type { Chart } from "chart.js";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { exportRowsToCsv, type GridExportColumn } from "../gridExport";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function chartToPngDataUrl(chart: Chart | null | undefined): string | undefined {
  if (!chart) return undefined;
  return chart.toBase64Image("image/png", 1);
}

export function downloadChartPng(filename: string, chart: Chart | null | undefined) {
  const url = chartToPngDataUrl(chart);
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.rel = "noopener";
  a.click();
}

export type BiPdfSection = {
  title: string;
  asOf?: string;
  caption?: string;
  pngDataUrl?: string;
  columns: GridExportColumn[];
  rows: Record<string, unknown>[];
};

function addSection(doc: jsPDF, section: BiPdfSection, startY: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = startY;
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(section.title, margin, y);
  y += 6;
  if (section.asOf || section.caption) {
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const sub = [section.asOf ? `As of ${section.asOf}` : "", section.caption ?? ""].filter(Boolean).join(" · ");
    if (sub) {
      doc.text(sub, margin, y);
      y += 6;
    }
  }
  if (section.pngDataUrl) {
    const imgW = pageW - margin * 2;
    const imgH = 72;
    try {
      doc.addImage(section.pngDataUrl, "PNG", margin, y, imgW, imgH);
      y += imgH + 8;
    } catch {
      // Chart image optional if canvas is empty.
    }
  }
  if (section.columns.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [section.columns.map((c) => c.header)],
      body: section.rows.map((row) => section.columns.map((c) => String(c.value(row) ?? ""))),
      styles: { fontSize: 8, textColor: [15, 23, 42], fillColor: [255, 255, 255] },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 12;
  }
  return y;
}

export function downloadBiPdf(filename: string, sections: BiPdfSection[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
  let y = 16;
  sections.forEach((section, i) => {
    if (i > 0) {
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
      y = 16;
    }
    addSection(doc, section, y);
  });
  const name = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  const blob = doc.output("blob");
  downloadBlob(name, blob);
}

export function downloadBiCsv(filename: string, columns: GridExportColumn[], rows: Record<string, unknown>[]) {
  exportRowsToCsv(filename, columns, rows);
}
