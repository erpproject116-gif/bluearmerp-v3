import * as XLSX from "xlsx";

export type GridExportColumn = {
  key: string;
  header: string;
  value: (row: Record<string, unknown>) => string | number;
};

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRowsToCsv(filename: string, columns: GridExportColumn[], rows: Record<string, unknown>[]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    columns.map((c) => esc(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => esc(c.value(row))).join(",")),
  ];
  downloadBlob(filename.endsWith(".csv") ? filename : `${filename}.csv`, new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
}

export function exportRowsToXlsx(filename: string, columns: GridExportColumn[], rows: Record<string, unknown>[]) {
  const aoa = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => c.value(row))),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Data");
  XLSX.writeFile(book, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Opens a print-friendly table; users can Save as PDF from the browser print dialog. */
export function printRowsAsPdf(title: string, columns: GridExportColumn[], rows: Record<string, unknown>[]) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!w) return;
  const th = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td>${escapeHtml(String(c.value(row) ?? ""))}</td>`).join("")}</tr>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 16px; color: #0f172a; }
      h1 { font-size: 16px; margin: 0 0 12px; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
      th { background: #f8fafc; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`);
  w.document.close();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function GridExportButtons(props: {
  title: string;
  filename: string;
  columns: GridExportColumn[];
  rows: () => Record<string, unknown>[];
}) {
  const cols = () => props.columns;
  const data = () => props.rows();
  return (
    <>
      <button
        type="button"
        class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
        onClick={() => printRowsAsPdf(props.title, cols(), data())}
        title="Print or Save as PDF"
      >
        Print / PDF
      </button>
      <button
        type="button"
        class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
        onClick={() => exportRowsToCsv(props.filename, cols(), data())}
      >
        CSV
      </button>
      <button
        type="button"
        class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
        onClick={() => exportRowsToXlsx(props.filename, cols(), data())}
      >
        Excel
      </button>
    </>
  );
}
