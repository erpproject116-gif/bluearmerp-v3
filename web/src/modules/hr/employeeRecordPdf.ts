import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";

export type EmpPdfEmployee = {
  employee_no?: string;
  full_name?: string;
  department?: string;
  job_title?: string;
  hire_date?: string;
  status?: string;
  base_salary?: number;
  email?: string;
  birthdate?: string;
  national_id?: string;
  emergency_contact_name?: string;
  emergency_contact_address?: string;
  emergency_contact_phone?: string;
  tin?: string;
  sss_no?: string;
  philhealth_no?: string;
  pagibig_no?: string;
  tax_status?: string;
  bank_name?: string;
  bank_account_no?: string;
  gender?: string;
  civil_status?: string;
  cellphone?: string;
  city_address?: string;
  provincial_address?: string;
  birthplace?: string;
  citizenship?: string;
  height?: string;
  weight?: string;
  religion?: string;
  spouse_name?: string;
  spouse_occupation?: string;
  special_skills?: string;
  notes?: string | null;
  source_application_id?: number | null;
  user_id?: number | null;
};

export type EmpPdfDoc = {
  id?: number;
  title?: string;
  doc_type?: string;
  file_name?: string;
  mime_type?: string;
  has_file?: boolean;
  created_at?: string;
  /** Preloaded image (data URL) for photo / ID scans. */
  imageDataUrl?: string;
};

export type EmpPdfAssignment = {
  client_name?: string;
  site_name?: string;
  start_date?: string;
  end_date?: string;
};

export type EmpPdfPayItem = {
  item_code?: string;
  item_name?: string;
  item_kind?: string;
  amount?: number;
  is_active?: boolean;
};

export type EmpPdfBranding = {
  companyName: string;
  headerText?: string;
  footerText?: string;
  logoDataUrl?: string;
};

const MARGIN_X = 14;
const HEADER_H = 28;
const FOOTER_H = 14;

function kvRows(pairs: [string, string | number | null | undefined][]) {
  return pairs
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => [k, String(v)]);
}

function lastY(doc: jsPDF, fallback: number) {
  return ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback) + 6;
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - FOOTER_H - 4) {
    doc.addPage();
    return HEADER_H + 6;
  }
  return y;
}

function drawBrandedChrome(doc: jsPDF, branding: EmpPdfBranding, docTitle: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  const generated = new Date().toLocaleString();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    if (branding.logoDataUrl) {
      try {
        doc.addImage(branding.logoDataUrl, "PNG", MARGIN_X, 8, 18, 12);
      } catch {
        try {
          doc.addImage(branding.logoDataUrl, "JPEG", MARGIN_X, 8, 18, 12);
        } catch {
          /* logo optional */
        }
      }
    }

    const textX = branding.logoDataUrl ? MARGIN_X + 22 : MARGIN_X;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(branding.companyName || "Company", textX, 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const headerLines = (branding.headerText || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3);
    let hy = 16;
    for (const line of headerLines) {
      doc.text(line, textX, hy, { maxWidth: pageW - textX - MARGIN_X });
      hy += 3.5;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(docTitle, pageW - MARGIN_X, 12, { align: "right" });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, HEADER_H - 2, pageW - MARGIN_X, HEADER_H - 2);

    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN_X, pageH - FOOTER_H, pageW - MARGIN_X, pageH - FOOTER_H);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const footer = (branding.footerText || "").trim() || "Confidential — employee 201 file";
    doc.text(footer, MARGIN_X, pageH - FOOTER_H + 5, { maxWidth: pageW - 50 });
    doc.text(`Generated ${generated} · Page ${i} of ${pageCount}`, pageW - MARGIN_X, pageH - FOOTER_H + 5, {
      align: "right",
    });
  }
}

function sectionTitle(doc: jsPDF, y: number, title: string): number {
  y = ensureSpace(doc, y, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title, MARGIN_X, y);
  return y + 3;
}

function fieldTable(doc: jsPDF, y: number, rows: string[][]): number {
  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("No data on file.", MARGIN_X, y + 4);
    return y + 10;
  }
  autoTable(doc, {
    startY: y,
    head: [["Field", "Value"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_H, bottom: FOOTER_H + 4 },
  });
  return lastY(doc, y);
}

export type EmpRecordPackageOpts = {
  employee: EmpPdfEmployee;
  assignments?: EmpPdfAssignment[];
  documents?: EmpPdfDoc[];
  payItems?: EmpPdfPayItem[];
  customFields?: [string, string][];
  signatureDataUrl?: string;
  branding: EmpPdfBranding;
  /** Binary files to pack alongside the summary PDF (images, docs, custom-field files). */
  attachmentFiles?: { path: string; blob: Blob }[];
};

function nameSlug(raw: string): string {
  const s = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  return s || "x";
}

/** ZIP / record basename: lastname-firstname-MM-DD-YYYY */
export function employeeRecordZipBaseName(fullName: string, when = new Date()): string {
  const cleaned = fullName.replace(/["']/g, "").replace(/\s+/g, " ").trim();
  let last = "employee";
  let first = "record";
  if (cleaned.includes(",")) {
    const [l, rest = ""] = cleaned.split(",", 2);
    last = l.trim() || last;
    first = rest.trim().split(/\s+/)[0] || first;
  } else {
    const parts = cleaned.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0]!;
      last = parts[parts.length - 1]!;
    } else if (parts.length === 1) {
      last = parts[0]!;
    }
  }
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const dd = String(when.getDate()).padStart(2, "0");
  const yyyy = String(when.getFullYear());
  return `${nameSlug(last)}-${nameSlug(first)}-${mm}-${dd}-${yyyy}`;
}

function uniqueZipPath(used: Set<string>, preferred: string): string {
  const norm = preferred.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!used.has(norm)) {
    used.add(norm);
    return norm;
  }
  const slash = norm.lastIndexOf("/");
  const dir = slash >= 0 ? norm.slice(0, slash + 1) : "";
  const file = slash >= 0 ? norm.slice(slash + 1) : norm;
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  let i = 2;
  let candidate = `${dir}${stem}-${i}${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${dir}${stem}-${i}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function buildEmployeeRecordPdfBlob(opts: EmpRecordPackageOpts): Blob {
  const emp = opts.employee;
  const branding = opts.branding;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const docTitle = "Employee 201 file";
  let y = HEADER_H + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(emp.full_name || emp.employee_no || "Employee", MARGIN_X, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const subtitle = [emp.employee_no, emp.job_title, emp.department, emp.status]
    .filter((v) => v && String(v).trim())
    .join(" · ");
  if (subtitle) {
    doc.text(subtitle, MARGIN_X, y);
    y += 6;
  } else {
    y += 2;
  }

  y = sectionTitle(doc, y, "1. Employment");
  y = fieldTable(
    doc,
    y,
    kvRows([
      ["Employee no", emp.employee_no],
      ["Full name", emp.full_name],
      ["Department", emp.department],
      ["Job title", emp.job_title],
      ["Hire date", emp.hire_date],
      ["Status", emp.status],
      ["Base salary", emp.base_salary],
      ["Email", emp.email],
      ["Linked ESS user id", emp.user_id],
      ["Birthdate", emp.birthdate],
      ["National ID", emp.national_id],
      ["Emergency contact", emp.emergency_contact_name],
      ["Emergency address", emp.emergency_contact_address],
      ["Emergency phone", emp.emergency_contact_phone],
      ["Source application", emp.source_application_id],
      ["Notes", emp.notes],
    ]),
  );

  y = sectionTitle(doc, y, "2. 201 — PIS");
  y = fieldTable(
    doc,
    y,
    kvRows([
      ["Gender", emp.gender],
      ["Civil status", emp.civil_status],
      ["Cellphone", emp.cellphone],
      ["Citizenship", emp.citizenship],
      ["Birthplace", emp.birthplace],
      ["Religion", emp.religion],
      ["Height", emp.height],
      ["Weight", emp.weight],
      ["City address", emp.city_address],
      ["Provincial address", emp.provincial_address],
      ["Spouse", emp.spouse_name],
      ["Spouse occupation", emp.spouse_occupation],
      ["Special skills", emp.special_skills],
    ]),
  );

  y = sectionTitle(doc, y, "3. 201 — statutory");
  y = fieldTable(
    doc,
    y,
    kvRows([
      ["TIN", emp.tin],
      ["SSS", emp.sss_no],
      ["PhilHealth", emp.philhealth_no],
      ["Pag-IBIG", emp.pagibig_no],
      ["Tax status", emp.tax_status],
      ["Bank", emp.bank_name],
      ["Bank account", emp.bank_account_no],
    ]),
  );

  y = sectionTitle(doc, y, "4. Assignment");
  const assigns = opts.assignments ?? [];
  autoTable(doc, {
    startY: y,
    head: [["Client", "Site", "Start", "End"]],
    body:
      assigns.length > 0
        ? assigns.map((a) => [a.client_name ?? "", a.site_name ?? "", a.start_date ?? "", a.end_date || "Open"])
        : [["—", "No assignments on file", "", ""]],
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_H, bottom: FOOTER_H + 4 },
  });
  y = lastY(doc, y);

  y = sectionTitle(doc, y, "5. Pay items");
  const payItems = opts.payItems ?? [];
  autoTable(doc, {
    startY: y,
    head: [["Code", "Name", "Kind", "Amount", "Active"]],
    body:
      payItems.length > 0
        ? payItems.map((p) => [
            p.item_code ?? "",
            p.item_name ?? "",
            p.item_kind ?? "",
            p.amount ?? "",
            p.is_active === false ? "No" : "Yes",
          ])
        : [["—", "No pay items", "", "", ""]],
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_H, bottom: FOOTER_H + 4 },
  });
  y = lastY(doc, y);

  const customs = (opts.customFields ?? []).filter(([, v]) => String(v ?? "").trim() !== "");
  if (customs.length > 0) {
    y = sectionTitle(doc, y, "6. Custom fields");
    y = fieldTable(doc, y, customs);
  }

  const docs = opts.documents ?? [];
  y = sectionTitle(doc, y, customs.length > 0 ? "7. 201 — documents index" : "6. 201 — documents index");
  autoTable(doc, {
    startY: y,
    head: [["Title", "Type", "File", "MIME", "On file"]],
    body:
      docs.length > 0
        ? docs.map((d) => [
            d.title ?? "",
            d.doc_type ?? "",
            d.file_name ?? "",
            d.mime_type ?? "",
            d.has_file || d.imageDataUrl ? "Yes" : "No",
          ])
        : [["None", "", "", "", ""]],
    styles: { fontSize: 8.5, cellPadding: 1.4 },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_H, bottom: FOOTER_H + 4 },
  });
  y = lastY(doc, y);

  if (opts.signatureDataUrl) {
    y = ensureSpace(doc, y, 40);
    y = sectionTitle(doc, y, "Signature on file");
    try {
      doc.addImage(opts.signatureDataUrl, "PNG", MARGIN_X, y, 60, 24);
      y += 28;
    } catch {
      doc.setFontSize(9);
      doc.text("Signature image could not be embedded.", MARGIN_X, y + 4);
      y += 10;
    }
  }

  const imageDocs = docs.filter((d) => d.imageDataUrl);
  for (const att of imageDocs) {
    doc.addPage();
    y = HEADER_H + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Attachment · ${att.title || att.file_name || att.doc_type || "File"}`, MARGIN_X, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text([att.doc_type, att.file_name, att.mime_type].filter(Boolean).join(" · "), MARGIN_X, y);
    y += 6;
    try {
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const maxW = pageW - MARGIN_X * 2;
      const maxH = pageH - y - FOOTER_H - 6;
      const fmt = (att.mime_type || "").includes("jpeg") || (att.mime_type || "").includes("jpg") ? "JPEG" : "PNG";
      doc.addImage(att.imageDataUrl!, fmt, MARGIN_X, y, maxW, maxH, undefined, "FAST");
    } catch {
      doc.setFontSize(9);
      doc.text("Could not embed this attachment image.", MARGIN_X, y + 4);
    }
  }

  const nonImageWithFile = docs.filter((d) => (d.has_file || d.file_name) && !d.imageDataUrl);
  if (nonImageWithFile.length > 0) {
    doc.addPage();
    y = HEADER_H + 6;
    y = sectionTitle(doc, y, "Other attachments (listed, not embedded)");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      "Non-image files (PDF, Word, etc.) stay in the employee 201 vault. Open them from the Documents tab.",
      MARGIN_X,
      y + 2,
      { maxWidth: doc.internal.pageSize.getWidth() - MARGIN_X * 2 },
    );
    y += 10;
    autoTable(doc, {
      startY: y,
      head: [["Title", "Type", "File", "MIME"]],
      body: nonImageWithFile.map((d) => [d.title ?? "", d.doc_type ?? "", d.file_name ?? "", d.mime_type ?? ""]),
      styles: { fontSize: 8.5, cellPadding: 1.4 },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
      margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_H, bottom: FOOTER_H + 4 },
    });
  }

  drawBrandedChrome(doc, branding, docTitle);

  return doc.output("blob");
}

export function downloadEmployeeRecordPdf(opts: EmpRecordPackageOpts) {
  const blob = buildEmployeeRecordPdfBlob(opts);
  const base = employeeRecordZipBaseName(opts.employee.full_name || opts.employee.employee_no || "employee");
  triggerBlobDownload(blob, `${base}-record.pdf`);
}

/** Summary PDF + every attached file in one ZIP named lastname-firstname-MM-DD-YYYY.zip */
export async function downloadEmployeeRecordPackage(opts: EmpRecordPackageOpts): Promise<string> {
  const base = employeeRecordZipBaseName(opts.employee.full_name || opts.employee.employee_no || "employee");
  const zip = new JSZip();
  zip.file(`${base}-record.pdf`, buildEmployeeRecordPdfBlob(opts));

  const used = new Set<string>([`${base}-record.pdf`]);
  for (const file of opts.attachmentFiles ?? []) {
    if (!file.blob || file.blob.size <= 0) continue;
    const path = uniqueZipPath(used, file.path || "documents/file");
    zip.file(path, file.blob);
  }

  const out = await zip.generateAsync({ type: "blob" });
  const zipName = `${base}.zip`;
  triggerBlobDownload(out, zipName);
  return zipName;
}
