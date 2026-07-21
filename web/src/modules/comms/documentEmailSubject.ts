/** Build compose subject: `{item} {DocType} - {tenant}`. */
export function buildDocumentEmailSubject(
  itemName: string | null | undefined,
  docTypeLabel: string,
  tenantName: string | null | undefined,
): string {
  const item = (itemName ?? "").trim();
  const doc = docTypeLabel.trim();
  const tenant = (tenantName ?? "").trim();
  const head = [item, doc].filter(Boolean).join(" ");
  if (tenant) return head ? `${head} - ${tenant}` : tenant;
  return head;
}

/** First non-empty line item name. */
export function firstLineItemName(lines: { item_name?: string | null }[] | null | undefined): string {
  for (const ln of lines ?? []) {
    const n = (ln.item_name ?? "").trim();
    if (n) return n;
  }
  return "";
}

/** Strip list summary suffix like `A4Tech mouse+2` → `A4Tech mouse`. */
export function itemNameFromSummary(summary: string | null | undefined): string {
  const s = (summary ?? "").trim();
  if (!s) return "";
  return s.replace(/\+\d+\s*$/, "").trim();
}

export type DocumentEmailLine = {
  item_name?: string | null;
  qty?: string | number | null;
  line_total?: string | number | null;
};

export type DocumentEmailSnapshot = {
  docTypeLabel: string;
  /** e.g. Customer / Vendor */
  partyLabel?: string;
  partyName?: string | null;
  referenceNo?: string | null;
  dateLabel?: string;
  date?: string | null;
  dueDate?: string | null;
  currencyCode?: string | null;
  grandTotal?: number | null;
  paymentTerms?: string | null;
  notes?: string | null;
  lines?: DocumentEmailLine[] | null;
  companyName?: string | null;
  /** Max line items listed in the body (default 8). */
  maxLines?: number;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisplayDate(iso?: string | null): string {
  const raw = (iso ?? "").trim();
  if (!raw) return "";
  const [y, m, d] = raw.split("-");
  if (y && m && d && y.length === 4) return `${m}/${d}/${y}`;
  return raw;
}

function parseAmount(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number, currencyCode?: string | null): string {
  const formatted = amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ccy = (currencyCode ?? "").trim();
  return ccy ? `${ccy} ${formatted}` : formatted;
}

function formatQty(v: string | number | null | undefined): string {
  const n = parseAmount(v);
  if (!n) return String(v ?? "").trim();
  return n.toLocaleString("en-PH", { maximumFractionDigits: 4 });
}

/** HTML body for the compose editor from the open transaction. */
export function buildDocumentEmailBody(s: DocumentEmailSnapshot): string {
  const doc = s.docTypeLabel.trim() || "document";
  const party = (s.partyName ?? "").trim();
  const company = (s.companyName ?? "").trim();
  const ref = (s.referenceNo ?? "").trim();
  const greeting = party ? `Dear ${escapeHtml(party)},` : "Hello,";

  const facts: string[] = [];
  if (ref) facts.push(`<li><strong>${escapeHtml(doc)} no.:</strong> ${escapeHtml(ref)}</li>`);
  const dateDisp = formatDisplayDate(s.date);
  if (dateDisp) {
    const label = (s.dateLabel ?? "Date").trim() || "Date";
    facts.push(`<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(dateDisp)}</li>`);
  }
  const dueDisp = formatDisplayDate(s.dueDate);
  if (dueDisp) facts.push(`<li><strong>Due date:</strong> ${escapeHtml(dueDisp)}</li>`);
  if (party) {
    const pl = (s.partyLabel ?? "Party").trim() || "Party";
    facts.push(`<li><strong>${escapeHtml(pl)}:</strong> ${escapeHtml(party)}</li>`);
  }
  const terms = (s.paymentTerms ?? "").trim();
  if (terms) facts.push(`<li><strong>Payment terms:</strong> ${escapeHtml(terms)}</li>`);

  const filledLines = (s.lines ?? []).filter((ln) => (ln.item_name ?? "").trim());
  const max = s.maxLines ?? 8;
  const shown = filledLines.slice(0, max);
  const more = filledLines.length - shown.length;

  let grand = s.grandTotal;
  if (grand == null || !Number.isFinite(grand)) {
    grand = filledLines.reduce((sum, ln) => sum + parseAmount(ln.line_total), 0);
  }
  if (grand != null && Number.isFinite(grand) && grand > 0) {
    facts.push(`<li><strong>Grand total:</strong> ${escapeHtml(formatMoney(grand, s.currencyCode))}</li>`);
  } else if ((s.currencyCode ?? "").trim()) {
    facts.push(`<li><strong>Currency:</strong> ${escapeHtml((s.currencyCode ?? "").trim())}</li>`);
  }

  const parts: string[] = [];
  parts.push(`<p style="margin:0 0 12px 0">${greeting}</p>`);
  parts.push(
    `<p style="margin:0 0 12px 0">Please find attached our ${escapeHtml(doc)}${ref ? ` <strong>${escapeHtml(ref)}</strong>` : ""}. A summary from the transaction is below.</p>`,
  );
  if (facts.length) {
    parts.push(`<ul style="margin:0 0 12px 0;padding-left:20px">${facts.join("")}</ul>`);
  }
  if (shown.length) {
    parts.push(`<p style="margin:0 0 8px 0"><strong>Items:</strong></p>`);
    const lis = shown.map((ln) => {
      const name = escapeHtml((ln.item_name ?? "").trim());
      const qty = formatQty(ln.qty);
      const amt = parseAmount(ln.line_total);
      const qtyBit = qty ? ` × ${escapeHtml(qty)}` : "";
      const amtBit = amt > 0 ? ` — ${escapeHtml(formatMoney(amt, s.currencyCode))}` : "";
      return `<li style="margin:0.15em 0">${name}${qtyBit}${amtBit}</li>`;
    });
    if (more > 0) lis.push(`<li style="margin:0.15em 0"><em>+${more} more item${more === 1 ? "" : "s"} (see attached PDF)</em></li>`);
    parts.push(`<ul style="margin:0 0 12px 0;padding-left:20px">${lis.join("")}</ul>`);
  }
  const notes = (s.notes ?? "").trim();
  if (notes) {
    parts.push(`<p style="margin:0 0 12px 0"><strong>Notes:</strong> ${escapeHtml(notes)}</p>`);
  }
  parts.push(`<p style="margin:0 0 12px 0">The PDF document is attached to this email.</p>`);
  if (company) {
    parts.push(`<p style="margin:0">Thank you,<br>${escapeHtml(company)}</p>`);
  } else {
    parts.push(`<p style="margin:0">Thank you.</p>`);
  }
  return parts.join("<p style=\"margin:0 0 8px 0\"><br></p>");
}
