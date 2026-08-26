import * as XLSX from "xlsx";
import { GridExportButtons, type GridExportColumn } from "../../shared/gridExport";
import { downloadApiFile, fetchApiText, parseCsvToAoa } from "../../shared/reports/downloadReportCsv";
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
  {
    key: "partner_name",
    header: "Customer",
    value: (r) => {
      const customer = String(r.partner_name ?? "").trim();
      if (customer) return customer;
      const requester = String(r.created_by_name ?? "").trim();
      return requester || "";
    },
  },
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

  const failMsg = (error?: string) => {
    if (error === "html" || error === "network") {
      return "Could not reach the tickets export API. Check API URL / redeploy, then try again.";
    }
    return "Failed to download tickets CSV.";
  };

  const downloadFullCsv = async () => {
    const result = await downloadApiFile(props.exportUrl("csv"), `${filename()}.csv`);
    if (!result.ok) {
      toast.warning(failMsg(result.error));
      return;
    }
    toast.success("Downloaded tickets with full description and comments.");
  };

  const downloadFullExcel = async () => {
    try {
      const fetched = await fetchApiText(props.exportUrl("csv"));
      if (!fetched.ok) {
        toast.warning(failMsg(fetched.error));
        return;
      }
      const aoa = parseCsvToAoa(fetched.text);
      if (aoa.length === 0) {
        toast.warning("No ticket data to export.");
        return;
      }
      // Build workbook from cells (same path as grid Excel). XLSX.read(csv)
      // often fails on multiline description/comments fields.
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Tickets");
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
