/**
 * Static @-mention catalog for Bluearm Copilot.
 * Shown immediately on bare "@"; filtered as the user types, then merged with entity search.
 */

export type MentionCatalogKind = "type" | "command" | "tool" | "topic";

export type MentionCatalogItem = {
  kind: MentionCatalogKind;
  /** Short badge label in the picker */
  badge: string;
  /** Primary line */
  label: string;
  /** Secondary hint */
  hint?: string;
  /**
   * What to insert when picked:
   * - type: leave caret after prefix so the user can keep typing (e.g. "customer:")
   * - command/tool/topic: replace the @ fragment with this prompt text
   */
  insert: string;
  /** Keep "@" prefix and leave caret for further typing (types only). */
  keepAtPrefix?: boolean;
};

const RECORD_TYPES: MentionCatalogItem[] = [
  { kind: "type", badge: "type", label: "Customer", hint: "Search partners", insert: "customer:", keepAtPrefix: true },
  { kind: "type", badge: "type", label: "Vendor", hint: "Search suppliers", insert: "vendor:", keepAtPrefix: true },
  { kind: "type", badge: "type", label: "Item / product", hint: "Search inventory", insert: "item:", keepAtPrefix: true },
  { kind: "type", badge: "type", label: "Serial", hint: "Lookup serial unit", insert: "serial:", keepAtPrefix: true },
  { kind: "type", badge: "type", label: "Quotation", hint: "Find quote by no.", insert: "quotation:", keepAtPrefix: true },
  { kind: "type", badge: "type", label: "Sales order", hint: "Find SO", insert: "sales_order:", keepAtPrefix: true },
  { kind: "type", badge: "type", label: "Purchase order", hint: "Find PO", insert: "purchase_order:", keepAtPrefix: true },
  { kind: "type", badge: "type", label: "Sales invoice", hint: "Find SI", insert: "sales:", keepAtPrefix: true },
];

const COMMANDS: MentionCatalogItem[] = [
  {
    kind: "command",
    badge: "command",
    label: "Generate quotation",
    hint: "Draft open-quotation action",
    insert: "Generate quotation for ",
  },
  {
    kind: "command",
    badge: "command",
    label: "Create sales order",
    hint: "Open SO create flow",
    insert: "Create sales order for ",
  },
  {
    kind: "command",
    badge: "command",
    label: "Create sales invoice",
    hint: "Open New Sale",
    insert: "Create sales invoice for ",
  },
  {
    kind: "command",
    badge: "command",
    label: "Create purchase request",
    hint: "Open PR",
    insert: "Create purchase request for ",
  },
  {
    kind: "command",
    badge: "command",
    label: "Create RFQ",
    hint: "Open RFQ",
    insert: "Create RFQ for ",
  },
  {
    kind: "command",
    badge: "command",
    label: "Create purchase order",
    hint: "Open PO",
    insert: "Create purchase order for ",
  },
  {
    kind: "command",
    badge: "command",
    label: "Create purchase / supplier invoice",
    hint: "Open New Purchase",
    insert: "Create supplier invoice for ",
  },
  {
    kind: "command",
    badge: "command",
    label: "Import inventory CSV",
    hint: "Bulk / mapping center",
    insert: "Help me import inventory from this spreadsheet",
  },
];

const TOOLS: MentionCatalogItem[] = [
  {
    kind: "tool",
    badge: "tool",
    label: "Stock on hand",
    hint: "find_stock",
    insert: "What is stock on hand for ",
  },
  {
    kind: "tool",
    badge: "tool",
    label: "Financial health",
    hint: "Cash / AR / AP snapshot",
    insert: "Show financial health as of today",
  },
  {
    kind: "tool",
    badge: "tool",
    label: "Overdue receivables",
    hint: "list_overdue_ar",
    insert: "List overdue receivables",
  },
  {
    kind: "tool",
    badge: "tool",
    label: "CRM follow-ups",
    hint: "crm_follow_ups",
    insert: "Show CRM follow-ups",
  },
  {
    kind: "tool",
    badge: "tool",
    label: "Smart notifications",
    hint: "Alerts",
    insert: "Show smart notifications",
  },
  {
    kind: "tool",
    badge: "tool",
    label: "Recommend items",
    hint: "Item suggestions",
    insert: "Recommend items for ",
  },
  {
    kind: "tool",
    badge: "tool",
    label: "Compare pricing",
    hint: "Price compare",
    insert: "Compare pricing for ",
  },
];

const TOPICS: MentionCatalogItem[] = [
  {
    kind: "topic",
    badge: "topic",
    label: "Load Slip empty",
    hint: "Why no open lines?",
    insert: "Why is Load Slip empty?",
  },
  {
    kind: "topic",
    badge: "topic",
    label: "Cannot confirm document",
    hint: "Confirm blocked",
    insert: "Why can't I confirm this document?",
  },
  {
    kind: "topic",
    badge: "topic",
    label: "Process policy gates",
    hint: "SO / GR requirements",
    insert: "Explain process policy gates for sales and purchases",
  },
  {
    kind: "topic",
    badge: "topic",
    label: "Quotation without inventory item",
    hint: "Free-text products",
    insert: "How do I save a quotation with products not yet in inventory?",
  },
  {
    kind: "topic",
    badge: "topic",
    label: "Print logo / letterhead",
    hint: "Branding",
    insert: "How do I set company logo on printables?",
  },
];

export const MENTION_CATALOG: MentionCatalogItem[] = [
  ...RECORD_TYPES,
  ...COMMANDS,
  ...TOOLS,
  ...TOPICS,
];

export type MentionPickerRow =
  | { source: "catalog"; item: MentionCatalogItem }
  | { source: "entity"; item: import("./helpApi").CopilotEntityRef };

function matchesQuery(item: MentionCatalogItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${item.badge} ${item.label} ${item.hint ?? ""} ${item.insert}`.toLowerCase();
  return hay.includes(needle) || item.insert.toLowerCase().startsWith(needle);
}

/** Catalog rows for bare @ or filtered local matches. */
export function filterMentionCatalog(query: string, limit = 24): MentionCatalogItem[] {
  const q = query.trim();
  // If user typed a type prefix like "customer:acme", don't flood with catalog — entity search owns it.
  if (/^[a-z_]+:/i.test(q)) return [];
  const matched = MENTION_CATALOG.filter((item) => matchesQuery(item, q));
  if (!q) {
    // Bare @: show a balanced starter set (types first, then a few commands/tools/topics).
    const types = RECORD_TYPES;
    const rest = [...COMMANDS.slice(0, 4), ...TOOLS.slice(0, 4), ...TOPICS.slice(0, 3)];
    return [...types, ...rest].slice(0, limit);
  }
  return matched.slice(0, limit);
}
