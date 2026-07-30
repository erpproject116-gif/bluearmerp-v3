/** Fixed Copilot workspace starters — tools/catalog only, no free invent. */

export type CopilotWorkflowTile = {
  id: string;
  group: "Money" | "Documents" | "Import" | "Drafts" | "Queues";
  label: string;
  hint: string;
  /** Canned ask query sent to existing /copilot/ask */
  query: string;
};

export const COPILOT_WORKFLOW_TILES: CopilotWorkflowTile[] = [
  {
    id: "financial_health",
    group: "Money",
    label: "Financial health",
    hint: "Cash and balance snapshot",
    query: "Show financial health for this company",
  },
  {
    id: "overdue_ar",
    group: "Queues",
    label: "Overdue receivables",
    hint: "Customers past due",
    query: "List overdue accounts receivable",
  },
  {
    id: "smart_notifications",
    group: "Queues",
    label: "Smart alerts",
    hint: "Unread and priority notifications",
    query: "Show my smart notifications and alerts",
  },
  {
    id: "find_stock",
    group: "Money",
    label: "Find stock",
    hint: "Look up item availability",
    query: "Find stock for items I mention with @",
  },
  {
    id: "crm_follow_ups",
    group: "Queues",
    label: "CRM follow-ups",
    hint: "Due customer follow-ups",
    query: "Show CRM follow-ups that need attention",
  },
  {
    id: "open_quotation",
    group: "Documents",
    label: "Draft quotation",
    hint: "Approve opens Quotation form",
    query: "Draft a new quotation",
  },
  {
    id: "open_sales",
    group: "Documents",
    label: "Draft sales invoice",
    hint: "Approve opens Sales form",
    query: "Open a new sales invoice",
  },
  {
    id: "open_po",
    group: "Documents",
    label: "Draft purchase order",
    hint: "Approve opens PO list/create",
    query: "Open a new purchase order",
  },
  {
    id: "open_purchases",
    group: "Documents",
    label: "Draft supplier invoice",
    hint: "Approve opens Purchases",
    query: "Open a new supplier invoice / purchase",
  },
  {
    id: "map_import",
    group: "Import",
    label: "Map CSV import",
    hint: "Attach a sheet, then Approve",
    query: "Map this attached dataset into Migration Center",
  },
  {
    id: "serial_import",
    group: "Import",
    label: "Import serials",
    hint: "Attach a sheet for Serial & Lot",
    query: "Propose serial/lot import from this attachment",
  },
  {
    id: "smart_rfq",
    group: "Import",
    label: "Smart RFQ from PDF",
    hint: "Attach RFQ PDF",
    query: "Run Smart RFQ from the attached PDF",
  },
  {
    id: "recurring_expense",
    group: "Drafts",
    label: "Recurring expense",
    hint: "Approve opens schedule draft",
    query: "Draft a recurring expense schedule",
  },
  {
    id: "follow_up",
    group: "Drafts",
    label: "CRM follow-up draft",
    hint: "Approve stages follow-up",
    query: "Draft a CRM follow-up",
  },
  {
    id: "statutory_hub",
    group: "Queues",
    label: "BIR statutory hub",
    hint: "Deep link — prepare workpapers",
    query: "How do I open BIR statutory reports and certificates?",
  },
  {
    id: "bank_reconciliation",
    group: "Queues",
    label: "Bank reconciliation",
    hint: "Unmatched statement lines",
    query: "How do I reconcile unmatched bank statement lines?",
  },
];

export const COPILOT_WORKFLOW_GROUPS = ["Queues", "Money", "Documents", "Import", "Drafts"] as const;
