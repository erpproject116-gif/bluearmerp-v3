/**
 * Question / error aliases for Help Assistant retrieval (Phase B).
 * Merged onto articles at index time — keep ids in sync with KB articles.
 */
export type HelpArticleAlias = {
  questions?: string[];
  errorPhrases?: string[];
};

export const helpArticleAliases: Record<string, HelpArticleAlias> = {
  "cannot-confirm-document": {
    questions: [
      "why can't I confirm",
      "cannot confirm quotation",
      "confirm button disabled",
      "blocked from confirming",
      "please fill in required fields",
    ],
    errorPhrases: [
      "please fill in required fields",
      "attach a file before confirming",
      "foundation incomplete",
    ],
  },
  "process-policy-gates-explained": {
    questions: [
      "what are process policies",
      "sales require quotation",
      "sales require so",
      "gr before supplier invoice",
      "why do I need goods receipt first",
    ],
    errorPhrases: ["goods receipt before supplier invoice", "require quotation before"],
  },
  "foundation-setup-blocked-api": {
    questions: [
      "cannot create quotation setup incomplete",
      "transactions blocked",
      "finish setup first",
      "api blocks post until foundation",
    ],
    errorPhrases: ["foundation incomplete", "workspace setup incomplete"],
  },
  "sales-return-serial": {
    questions: [
      "how to return a serial",
      "customer returned serial unit",
      "restore serial to stock",
      "sales return barcode",
    ],
  },
  "serial-count-mismatch": {
    questions: [
      "serial count does not match",
      "scan count wrong",
      "need more serials to save",
      "accepted serials not equal qty",
    ],
    errorPhrases: ["serial count does not match", "serial count must equal"],
  },
  "official-receipt-after-si": {
    questions: [
      "how to collect payment",
      "cash in after invoice",
      "create official receipt",
      "record customer payment",
    ],
  },
  "payment-voucher-after-purchase": {
    questions: [
      "how to pay vendor",
      "cash payment after purchase",
      "create payment voucher",
      "pay supplier invoice",
    ],
  },
  "chart-of-accounts-ph-template": {
    questions: [
      "empty chart of accounts",
      "import ph sme accounts",
      "philippines coa template",
      "no gl accounts",
      "standard philippine chart of accounts",
      "use standard philippine chart",
      "default chart of accounts new tenant",
    ],
  },
  "dashboard": {
    questions: [
      "dashboard receivables payables",
      "home unpaid invoices",
      "total receivables overview",
      "cash flow on home",
    ],
  },
  "coa-soft-delete-restore": {
    questions: ["delete gl account", "restore chart of accounts line", "hide inactive account"],
  },
  "operations-calendar-day-today": {
    questions: [
      "today button not working",
      "hourly calendar view",
      "google calendar day view",
      "create timed task",
      "operations day view",
    ],
  },
  "operations-packs-edit": {
    questions: ["edit pack columns", "system pack read only", "customize industry pack"],
  },
  "missing-menu-permission": {
    questions: [
      "menu missing",
      "no access to screen",
      "permission denied page",
      "role cannot see module",
    ],
    errorPhrases: ["you do not have permission", "permission denied"],
  },
  "quotation-progress-status": {
    questions: [
      "progress status required",
      "unconfirmed quotation status",
      "what is progress status",
    ],
    errorPhrases: ["please fill in required fields: progress status", "progress status"],
  },
  "quotation-rfq-ai-import": {
    questions: ["import rfq pdf", "parse boq into quotation", "ai quotation import", "dashscope rfq"],
  },
  "mapping-center-when-to-use": {
    questions: ["mapping center or load slip", "when to use mapping center", "bulk convert documents"],
  },
  "delivery-receipt-vs-shipping": {
    questions: [
      "difference delivery receipt shipping",
      "pick list vs shipping order",
      "so release mode",
    ],
  },
  "goods-receipt-serial-receive": {
    questions: ["receive serials on gr", "post gr with serial numbers", "vendor serial delivery"],
  },
  "lot-expiry-pick-rules": {
    questions: ["pick lot batch", "fefo expiry", "which batch to sell"],
  },
  "po-confirm-from-list": {
    questions: ["confirm po from list", "purchase order confirm after save", "po confirm disabled"],
  },
  "pr-approval-stuck": {
    questions: ["pr waiting approval", "cannot create po from pr", "who approves purchase request"],
  },
  "bank-rec-unmatched-lines": {
    questions: ["bank statement won't match", "unmatched reconciliation", "reconcile official receipt"],
  },
  "je-wont-post": {
    questions: ["journal won't post", "unbalanced journal", "draft journal stuck"],
    errorPhrases: ["journal is unbalanced", "fiscal period closed"],
  },
  "multi-branch-defaults": {
    questions: ["wrong warehouse stock", "active branch stock list", "document wrong location"],
  },
  "switch-tenant-vs-branch": {
    questions: ["switch company vs branch", "wrong business workspace", "change warehouse not company"],
  },
  "gmail-comms-connect": {
    questions: ["connect gmail", "smtp not sending", "document email not received", "comms inbox"],
  },
  "work-item-link-erp-doc": {
    questions: ["link kanban to quotation", "attach po to work item", "operations document link"],
  },
  "custom-field-required-block": {
    questions: ["custom field required", "hidden required field", "cannot save custom field"],
    errorPhrases: ["please fill in required fields"],
  },
  "manufacturing-wo-issue-complete": {
    questions: ["issue bom components", "complete work order", "produce finished goods"],
  },
  "job-costing-link-expenses": {
    questions: ["put cost on job", "link purchase to project", "job budget vs actual"],
  },
  "quality-ncr-capa-loop": {
    questions: ["create capa from ncr", "close non conformance", "quality corrective action"],
  },
  "wms-scheduled-receipt-variance": {
    questions: ["dock appointment variance", "expected vs actual receipt", "short receive wms"],
  },
  "customer-portal-what-they-see": {
    questions: ["what can customers see on portal", "enable customer portal", "portal read only"],
  },
  "where-status-reports-live": {
    questions: [
      "where is sales status",
      "where is pre invoicing",
      "where is receivable status",
      "find ar ap reports",
    ],
  },
  "collective-invoice-edge-cases": {
    questions: ["group invoice missing order", "collective invoicing problem", "bill multiple so"],
  },
  "sales-hold-list-resume": {
    questions: ["resume held invoice", "sales hold list", "park draft sale"],
  },
  "demo-data-golden-scenarios": {
    questions: ["what does demo data load", "golden scenarios", "demo riverside reno"],
  },
  "bi-reports-overview": {
    questions: ["where is bi", "analytics reports", "dashboard vs bi"],
  },
  "hr-payroll-run-basics": {
    questions: ["run payroll", "process salary", "create payroll run"],
  },
  "fixed-assets-depreciation-basics": {
    questions: ["register fixed asset", "run depreciation", "asset disposal"],
  },
  "support-ticket-from-after-sales": {
    questions: ["create support ticket", "ticket after repair", "customer complaint ticket"],
  },
  "data-center-import-errors": {
    questions: ["import spreadsheet failed", "data center validation errors", "fix import errors"],
  },
  // Existing high-traffic articles
  "rfq-workflow": {
    questions: ["how does rfq work", "accept supplier quotation", "rfq to purchase order"],
  },
  "load-slip-overview": {
    questions: ["what is load slip", "copy lines between documents", "how to use load slip"],
  },
  "quotation-to-sales-flow": {
    questions: ["quote to cash", "convert quotation to sales order", "quotation to invoice"],
  },
  "serial-barcode-scanning": {
    questions: ["how to scan serial", "barcode serial receive", "track serial setup"],
  },
  "document-attachments-workflow": {
    questions: ["upload attachment before confirm", "attachments on save", "required file upload"],
    errorPhrases: ["attach a file before confirming"],
  },
  "onboarding-playbook": {
    questions: ["onboarding checklist", "first week playbook", "start here erp"],
  },
  "switch-between-businesses": {
    questions: ["switch company", "change business workspace", "multiple tenants"],
  },
  "goods-receipt-load-slip": {
    questions: ["invoice from goods receipt", "si from gr", "bill vendor after receive"],
  },
  "sales-cash-in-after-save": {
    questions: ["cash in button", "collect after sales invoice"],
  },
  "purchase-cash-payment-after-save": {
    questions: ["cash payment button", "pay after purchase save"],
  },
  "operations-hub-intro": {
    questions: ["operations kanban", "work hub board", "monday style board"],
  },
  "approvals-queue": {
    questions: ["document approvals", "approve purchase request", "approval queue"],
  },
  "finance-je-draft-to-post": {
    questions: ["how journal entries post", "draft to posted je"],
  },
  "bank-reconciliation-weekly": {
    questions: ["how to reconcile bank", "match bank statement"],
  },
  "attachment-requirements": {
    questions: ["attachment required to confirm", "why need file on quotation"],
    errorPhrases: ["attach a file before confirming"],
  },
  "load-slip-no-lines": {
    questions: [
      "load slip empty",
      "load slip no lines",
      "no eligible lines load slip",
      "why is load slip blank",
    ],
    errorPhrases: ["no lines available", "no eligible source lines"],
  },
  "insufficient-stock-on-release": {
    questions: [
      "insufficient stock on release",
      "cannot release sales order",
      "pick list not enough stock",
      "on hand too low to release",
    ],
    errorPhrases: ["insufficient stock", "not enough stock"],
  },
  "print-or-pdf-failed": {
    questions: [
      "print failed",
      "pdf download failed",
      "print preview blank",
      "cannot print invoice",
    ],
  },
  "empty-list-wrong-branch": {
    questions: [
      "empty list wrong branch",
      "stock list empty",
      "documents missing after switch",
      "wrong warehouse filter",
    ],
  },
  "write-permission-vs-read": {
    questions: [
      "can view but cannot save",
      "read only permission",
      "confirm button needs write",
      "save not allowed",
    ],
    errorPhrases: ["you do not have permission", "permission denied"],
  },
  "tax-wrong-on-document": {
    questions: [
      "tax amount wrong",
      "vat incorrect on invoice",
      "inclusive vs exclusive tax",
      "wrong tax type on quotation",
    ],
  },
  "session-or-signin-issues": {
    questions: [
      "session expired",
      "cannot sign in",
      "unauthorized after idle",
      "password reset link expired",
    ],
    errorPhrases: ["unauthorized", "session expired"],
  },
  "calendar-drag-and-reminders": {
    questions: [
      "drag calendar task",
      "resize day view event",
      "calendar reminder",
      "move timed task on calendar",
    ],
  },
};
