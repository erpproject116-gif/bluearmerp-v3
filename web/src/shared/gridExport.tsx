import * as XLSX from "xlsx";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { apiFetch } from "./api";
import { EntityModal, Field, inputClass } from "./SpreadsheetGrid";
import { useToast } from "./toast";

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
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function withBom(csv: string): Blob {
  return new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
}

export function exportRowsToCsv(filename: string, columns: GridExportColumn[], rows: Record<string, unknown>[]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    columns.map((c) => esc(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => esc(c.value(row))).join(",")),
  ];
  downloadBlob(filename.endsWith(".csv") ? filename : `${filename}.csv`, withBom(lines.join("\r\n")));
}

/** CSV text (no BOM) for email attachments. */
export function rowsToCsvString(columns: GridExportColumn[], rows: Record<string, unknown>[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [
    columns.map((c) => esc(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => esc(c.value(row))).join(",")),
  ].join("\r\n");
}

export function rowsToPrintHtml(title: string, columns: GridExportColumn[], rows: Record<string, unknown>[]): string {
  return buildPrintHtml(title, columns, rows);
}

export function exportRowsToXlsx(filename: string, columns: GridExportColumn[], rows: Record<string, unknown>[]) {
  const aoa: (string | number)[][] = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => c.value(row))),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Data");
  XLSX.writeFile(book, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintHtml(title: string, columns: GridExportColumn[], rows: Record<string, unknown>[]): string {
  const th = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td>${escapeHtml(String(c.value(row) ?? ""))}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; padding: 16px; color: #0f172a; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      .meta { font-size: 11px; color: #64748b; margin-bottom: 12px; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; font-weight: 600; }
      @media print { body { padding: 0; } .no-print { display: none !important; } }
    </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${rows.length} row${rows.length === 1 ? "" : "s"} · ${new Date().toLocaleString()}</p>
    <table><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}">No rows</td></tr>`}</tbody></table>
    </body></html>`;
}

/** Reliable print via hidden iframe (avoids popup blockers). */
export function printRows(title: string, columns: GridExportColumn[], rows: Record<string, unknown>[]) {
  const html = buildPrintHtml(title, columns, rows);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    window.alert("Unable to open the print view. Check your browser settings.");
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow;
  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 1_000);
  };
  if (!win) {
    cleanup();
    return;
  }
  win.focus();
  window.setTimeout(() => {
    try {
      win.print();
    } finally {
      cleanup();
    }
  }, 250);
}

/**
 * Download a printable HTML file named .pdf.html so users can open it and
 * use the browser Print → Save as PDF. Also opens the print dialog immediately.
 */
export function downloadRowsAsPdf(title: string, columns: GridExportColumn[], rows: Record<string, unknown>[], filename: string) {
  const html = buildPrintHtml(title, columns, rows);
  const base = filename.replace(/\.(pdf|html?|csv|xlsx)$/i, "");
  downloadBlob(`${base}.pdf.html`, new Blob([html], { type: "text/html;charset=utf-8" }));
  printRows(title, columns, rows);
}

/** Scrape the first HTML table under a root element into export columns/rows. */
export function scrapeTableForExport(root: ParentNode | null | undefined): {
  columns: GridExportColumn[];
  rows: Record<string, unknown>[];
} | null {
  if (!root) return null;
  const table = root.querySelector("table");
  if (!table) return null;
  const headerCells = table.querySelectorAll("thead th, thead td");
  const headers: string[] = [];
  headerCells.forEach((cell) => {
    const t = (cell.textContent ?? "").trim();
    if (t) headers.push(t);
  });
  if (headers.length === 0) {
    const firstRow = table.querySelector("tr");
    firstRow?.querySelectorAll("th, td").forEach((cell) => {
      headers.push((cell.textContent ?? "").trim() || `Col${headers.length + 1}`);
    });
  }
  if (headers.length === 0) return null;

  const columns: GridExportColumn[] = headers.map((header, i) => ({
    key: `c${i}`,
    header,
    value: (row) => String(row[`c${i}`] ?? ""),
  }));

  const bodyRows = table.querySelectorAll("tbody tr");
  const rows: Record<string, unknown>[] = [];
  const source =
    bodyRows.length > 0
      ? bodyRows
      : Array.from(table.querySelectorAll("tr")).slice(headerCells.length > 0 ? 1 : 0);

  source.forEach((tr) => {
    const cells = tr.querySelectorAll("td, th");
    if (cells.length === 0) return;
    const row: Record<string, unknown> = {};
    headers.forEach((_, i) => {
      row[`c${i}`] = (cells[i]?.textContent ?? "").trim();
    });
    rows.push(row);
  });

  return { columns, rows };
}

export function GridExportButtons(props: {
  title: string;
  filename: string;
  columns: GridExportColumn[];
  rows: () => Record<string, unknown>[];
  /** Optional: scrape this element instead of props.rows/columns when set. */
  scrapeRoot?: () => HTMLElement | null | undefined;
  class?: string;
  /** Override default CSV export (e.g. server full-body download). */
  onDownloadCsv?: () => void | Promise<void>;
  /** Override default Excel export. */
  onDownloadExcel?: () => void | Promise<void>;
  /** Tooltip on Download CSV menu item. */
  csvHint?: string;
  /** Tooltip on Download Excel menu item. */
  excelHint?: string;
}) {
  const toast = useToast();
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [emailOpen, setEmailOpen] = createSignal(false);
  const [toAddrs, setToAddrs] = createSignal("");
  const [ccAddrs, setCcAddrs] = createSignal("");
  const [subject, setSubject] = createSignal("");
  const [bodyHtml, setBodyHtml] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [pendingPayload, setPendingPayload] = createSignal<{
    columns: GridExportColumn[];
    rows: Record<string, unknown>[];
  } | null>(null);

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-grid-export-menu]")) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    });
  });

  const resolve = (): { columns: GridExportColumn[]; rows: Record<string, unknown>[] } | null => {
    if (props.scrapeRoot) {
      const scraped = scrapeTableForExport(props.scrapeRoot());
      if (scraped && scraped.columns.length > 0) return scraped;
      window.alert("Nothing to export — run Search first so the report table is on screen.");
      return null;
    }
    const columns = props.columns;
    const rows = props.rows();
    if (!columns.length) {
      window.alert("Nothing to export — no columns.");
      return null;
    }
    return { columns, rows };
  };

  const closeMenu = () => setMenuOpen(false);

  const runAction = async (fn: () => void | Promise<void>) => {
    closeMenu();
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const openEmail = () => {
    const data = resolve();
    if (!data) return;
    closeMenu();
    setPendingPayload(data);
    setSubject(`${props.title} — ${new Date().toLocaleDateString()}`);
    setBodyHtml(
      `<p>Please find attached the report <strong>${props.title}</strong> (${data.rows.length} row${data.rows.length === 1 ? "" : "s"}).</p>`,
    );
    setToAddrs("");
    setCcAddrs("");
    setEmailOpen(true);
  };

  const sendEmail = async () => {
    const data = pendingPayload();
    if (!data) return;
    const to = toAddrs()
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (to.length === 0) {
      toast.warning("Enter at least one recipient email.");
      return;
    }
    const csv = rowsToCsvString(data.columns, data.rows);
    const html = rowsToPrintHtml(props.title, data.columns, data.rows);
    const b64 = (text: string) => btoa(unescape(encodeURIComponent(text)));
    const base = props.filename.replace(/\.(pdf|html?|csv|xlsx)$/i, "") || "report";
    setSending(true);
    const res = await apiFetch(
      "/api/v1/comms/send-report-email",
      {
        method: "POST",
        body: JSON.stringify({
          to_addrs: to,
          cc_addrs: ccAddrs()
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean),
          subject: subject().trim() || props.title,
          body_html: bodyHtml(),
          attachments: [
            { filename: `${base}.csv`, content_type: "text/csv; charset=utf-8", data_base64: b64(csv) },
            { filename: `${base}.html`, content_type: "text/html; charset=utf-8", data_base64: b64(html) },
          ],
        }),
      },
      { silent: true },
    );
    setSending(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to send report email.");
      return;
    }
    toast.success(res.message ?? "Report emailed.");
    setEmailOpen(false);
  };

  const triggerClass =
    props.class ??
    "inline-flex items-center gap-1.5 rounded-lg border border-stroke bg-white px-2.5 py-1.5 text-xs font-medium text-text-primary transition hover:bg-slate-50 disabled:opacity-50";

  const itemClass =
    "flex w-full items-center px-3 py-2 text-left text-sm text-text-primary transition hover:bg-slate-50 disabled:opacity-50";

  return (
    <>
      <div class="relative" data-grid-export-menu>
        <button
          type="button"
          class={triggerClass}
          disabled={busy()}
          aria-expanded={menuOpen()}
          aria-haspopup="menu"
          title="Print, download, or email this table"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <svg class="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export
          <svg
            class="h-3 w-3 shrink-0 opacity-70 transition-transform"
            classList={{ "rotate-180": menuOpen() }}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <Show when={menuOpen()}>
          <div
            role="menu"
            class="absolute right-0 z-[60] mt-1 min-w-[11.5rem] overflow-hidden rounded-lg border border-stroke bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              class={itemClass}
              disabled={busy()}
              onClick={() =>
                void runAction(() => {
                  const data = resolve();
                  if (!data) return;
                  printRows(props.title, data.columns, data.rows);
                })
              }
            >
              Print
            </button>
            <button
              type="button"
              role="menuitem"
              class={itemClass}
              disabled={busy()}
              title={props.csvHint}
              onClick={() =>
                void runAction(async () => {
                  if (props.onDownloadCsv) {
                    await props.onDownloadCsv();
                    return;
                  }
                  const data = resolve();
                  if (!data) return;
                  exportRowsToCsv(props.filename, data.columns, data.rows);
                })
              }
            >
              Download CSV
            </button>
            <button
              type="button"
              role="menuitem"
              class={itemClass}
              disabled={busy()}
              title={props.excelHint}
              onClick={() =>
                void runAction(async () => {
                  if (props.onDownloadExcel) {
                    await props.onDownloadExcel();
                    return;
                  }
                  const data = resolve();
                  if (!data) return;
                  try {
                    exportRowsToXlsx(props.filename, data.columns, data.rows);
                  } catch (err) {
                    console.error(err);
                    window.alert("Excel download failed. Try Download CSV instead.");
                  }
                })
              }
            >
              Download Excel
            </button>
            <button
              type="button"
              role="menuitem"
              class={itemClass}
              disabled={busy()}
              title="Downloads a printable file and opens Print — choose Save as PDF"
              onClick={() =>
                void runAction(() => {
                  const data = resolve();
                  if (!data) return;
                  downloadRowsAsPdf(props.title, data.columns, data.rows, props.filename);
                })
              }
            >
              Download PDF
            </button>
            <div class="my-1 border-t border-stroke" />
            <button type="button" role="menuitem" class={itemClass} disabled={busy()} onClick={openEmail}>
              Email report
            </button>
          </div>
        </Show>
      </div>

      <Show when={emailOpen()}>
        <EntityModal
          open={emailOpen()}
          title={`Email — ${props.title}`}
          onClose={() => setEmailOpen(false)}
          onSave={() => void sendEmail()}
          saving={sending()}
          saveLabel="Send"
          singleColumn
        >
          <Field label="To *">
            <input
              class={inputClass}
              value={toAddrs()}
              onInput={(e) => setToAddrs(e.currentTarget.value)}
              placeholder="name@company.com"
            />
          </Field>
          <Field label="Cc">
            <input
              class={inputClass}
              value={ccAddrs()}
              onInput={(e) => setCcAddrs(e.currentTarget.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Subject">
            <input class={inputClass} value={subject()} onInput={(e) => setSubject(e.currentTarget.value)} />
          </Field>
          <Field label="Message" span="full">
            <textarea
              class={`${inputClass} min-h-[80px]`}
              value={bodyHtml().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
              onInput={(e) => setBodyHtml(`<p>${e.currentTarget.value}</p>`)}
            />
          </Field>
          <p class="col-span-full text-xs text-text-secondary">
            CSV and HTML copies of the on-screen report will be attached automatically.
          </p>
        </EntityModal>
      </Show>
    </>
  );
}
