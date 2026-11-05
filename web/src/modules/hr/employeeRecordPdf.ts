import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
};

export type EmpPdfDoc = {
  title?: string;
  doc_type?: string;
  expires_on?: string;
  file_name?: string;
};

export type EmpPdfAssignment = {
  client_name?: string;
  site_name?: string;
  start_date?: string;
  end_date?: string;
};

function kvRows(pairs: [string, string | number | null | undefined][]) {
  return pairs
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => [k, String(v)]);
}

export function downloadEmployeeRecordPdf(opts: {
  employee: EmpPdfEmployee;
  assignments?: EmpPdfAssignment[];
  documents?: EmpPdfDoc[];
}) {
  const emp = opts.employee;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 14;
  doc.setFontSize(14);
  doc.text("Employee 201 file", 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(emp.full_name || emp.employee_no || "Employee", 14, y);
  y += 6;

  doc.setFontSize(11);
  doc.text("1. Employment details", 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Field", "Value"]],
    body: kvRows([
      ["Employee no", emp.employee_no],
      ["Full name", emp.full_name],
      ["Department", emp.department],
      ["Job title", emp.job_title],
      ["Hire date", emp.hire_date],
      ["Status", emp.status],
      ["Base salary", emp.base_salary],
      ["Email", emp.email],
      ["Birthdate", emp.birthdate],
      ["National ID", emp.national_id],
      ["Gender", emp.gender],
      ["Civil status", emp.civil_status],
      ["Cellphone", emp.cellphone],
      ["City address", emp.city_address],
      ["Provincial address", emp.provincial_address],
      ["Birthplace", emp.birthplace],
      ["Citizenship", emp.citizenship],
      ["Height", emp.height],
      ["Weight", emp.weight],
      ["Religion", emp.religion],
      ["Spouse", emp.spouse_name],
      ["Spouse occupation", emp.spouse_occupation],
      ["Special skills", emp.special_skills],
      ["Emergency contact", emp.emergency_contact_name],
      ["Emergency address", emp.emergency_contact_address],
      ["Emergency phone", emp.emergency_contact_phone],
      ["Notes", emp.notes],
    ]),
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;

  doc.setFontSize(11);
  doc.text("2. 201 — statutory & assignment", 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Field", "Value"]],
    body: kvRows([
      ["TIN", emp.tin],
      ["SSS", emp.sss_no],
      ["PhilHealth", emp.philhealth_no],
      ["Pag-IBIG", emp.pagibig_no],
      ["Tax status", emp.tax_status],
      ["Bank", emp.bank_name],
      ["Bank account", emp.bank_account_no],
    ]),
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4;

  const assigns = opts.assignments ?? [];
  autoTable(doc, {
    startY: y,
    head: [["Client", "Site", "Start", "End"]],
    body:
      assigns.length > 0
        ? assigns.map((a) => [a.client_name ?? "", a.site_name ?? "", a.start_date ?? "", a.end_date || "Open"])
        : [["—", "No assignments", "", ""]],
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;

  doc.setFontSize(11);
  doc.text("3. 201 — documents", 14, y);
  y += 2;
  const docs = opts.documents ?? [];
  autoTable(doc, {
    startY: y,
    head: [["Title", "Type", "Expires", "File"]],
    body:
      docs.length > 0
        ? docs.map((d) => [d.title ?? "", d.doc_type ?? "", d.expires_on ?? "", d.file_name ?? ""])
        : [["None", "", "", ""]],
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  const safe = (emp.employee_no || emp.full_name || "employee").replace(/[^\w.-]+/g, "_");
  doc.save(`employee-201-${safe}.pdf`);
}
