export type HomeWidgetId =
  | "finance"
  | "day_jobs"
  | "shortcuts"
  | "sales_trend"
  | "inventory_trend"
  | "top_customers"
  | "top_items"
  | "cash_in_out"
  | "overdue";

export type HomeWidgetDef = {
  id: HomeWidgetId;
  label: string;
  blurb: string;
  /** Always on Home — cannot be removed. */
  pinned?: boolean;
  defaultOn?: boolean;
};

export const HOME_WIDGET_CATALOG: HomeWidgetDef[] = [
  {
    id: "finance",
    label: "Receivables, payables & cash",
    blurb: "What customers owe you, what you owe vendors, and cash this year.",
    pinned: true,
    defaultOn: true,
  },
  {
    id: "day_jobs",
    label: "My day",
    blurb: "Common jobs for your role, plus items that need a next step.",
    defaultOn: true,
  },
  {
    id: "shortcuts",
    label: "Quick actions",
    blurb: "One-click paths: new sale, collect, pay, add a product.",
  },
  {
    id: "sales_trend",
    label: "Sales by month",
    blurb: "Invoiced sales over recent months.",
  },
  {
    id: "inventory_trend",
    label: "Stock movement",
    blurb: "How inventory quantity changed month by month.",
  },
  {
    id: "top_customers",
    label: "Top customers",
    blurb: "Who bought the most in the last 90 days.",
  },
  {
    id: "top_items",
    label: "Top items",
    blurb: "Which products sold the most in the last 90 days.",
  },
  {
    id: "cash_in_out",
    label: "Money in vs out",
    blurb: "Receipts versus payments by month.",
  },
  {
    id: "overdue",
    label: "Overdue invoices",
    blurb: "Customer invoices past due — collect these first.",
  },
];

export const DEFAULT_HOME_WIDGETS: HomeWidgetId[] = ["finance", "day_jobs"];

const ALLOWED = new Set(HOME_WIDGET_CATALOG.map((w) => w.id));

/** Legacy widget ids moved to dedicated Home tabs. */
const LEGACY_TAB_WIDGETS = new Set(["getting_started", "recent_activity"]);

export function normalizeHomeWidgets(ids: string[] | undefined | null): HomeWidgetId[] {
  const out: HomeWidgetId[] = [];
  const seen = new Set<string>();
  for (const id of ids ?? []) {
    if (LEGACY_TAB_WIDGETS.has(id)) continue;
    if (!ALLOWED.has(id as HomeWidgetId) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as HomeWidgetId);
  }
  if (!out.includes("finance")) out.unshift("finance");
  return out.slice(0, 12);
}

export function widgetDef(id: HomeWidgetId): HomeWidgetDef {
  return HOME_WIDGET_CATALOG.find((w) => w.id === id)!;
}
