import * as XLSX from "xlsx";
import { getAccessToken } from "../../shared/api";
import { GridExportButtons, type GridExportColumn } from "../../shared/gridExport";
import { useToast } from "../../shared/toast";
import type { Ticket } from "../../shared/useSupportTickets";

type Props = {
  title?: string;
  filename?: string;
  /** Current page rows (Print / PDF / Email). */
  rows: () => Ticket[];
  /** Filters applied to full Download CSV / Excel (all matching tickets + body + comments). */
  exportUrl: (format: "csv") => string;
};

const PAGE_COLUMNS: GridExportColumn[] = [
  { key: "ticket_no", header: "Ticket #", value: (r) => String(r.ticket_no ?? "") },
  { key: "ticket_date", header: "Date", value: (r) => String(r.ticket_date ?? "") },
  { key: "subject", header: "Subject / title", value: (r) => String(r.subject ?? "") },
  {
    key: "description",
    header: "Description / body",
    value: (r) => String(r.description ?? ""),
  },
  { key: "partner_name", header: "Customer", value: (r) => String(r.partner_name ?? "") },
  { key: "category", header: "Category", value: (r) => String(r.category ?? "") },
  { key: "priority", header: "Priority", value: (r) => String(r.priority ?? "") },
  { key: "status", header: "Status", value: (r) => String(r.status ?? "") },
  { key: "assigned_name", header: "Assigned", value: (r) => String(r.assigned_name ?? "") },
];

/**
 * Shared Export dropdown; CSV/Excel pull every matching ticket with full
 * description + comments from `/tickets/export`.
 */
export function TicketListExportButtons(props: Props) {
  const toast = useToast();
  const title = () => props.title ?? "Support tickets";
  const filename = () => props.filename ?? "support-tickets";

  const downloadFullCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(props.exportUrl("csv"), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      toast.warning("Failed to download tickets CSV.");
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${filename()}.csv`;
    a.click();
    URL.revokeObjectURL(objectUrl);
    toast.success("Downloaded tickets with full description and comments.");
  };

  const downloadFullExcel = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(props.exportUrl("csv"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        toast.warning("Failed to download tickets for Excel.");
        return;
      }
      const text = await res.text();
      const book = XLSX.read(text, { type: "string", raw: true });
      XLSX.writeFile(book, `${filename()}.xlsx`);
      toast.success("Downloaded tickets with full description and comments.");
    } catch (err) {
      console.error(err);
      toast.warning("Excel download failed. Try Download CSV instead.");
    }
  };

  return (
    <GridExportButtons
      title={title()}
      filename={filename()}
      columns={PAGE_COLUMNS}
      rows={() => props.rows() as unknown as Record<string, unknown>[]}
      onDownloadCsv={downloadFullCsv}
      onDownloadExcel={downloadFullExcel}
      csvHint="All matching tickets: title, full description, and comments"
      excelHint="All matching tickets: title, full description, and comments"
    />
  );
}
