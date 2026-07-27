import type { KbArticle } from "./documentationTypes";

/**
 * Scenario expansion for the Help Assistant (keyword RAG).
 * Problem-oriented articles: blockers, paraphrases, and deeper module Q&A.
 */
export const helpScenarioArticles: KbArticle[] = [
  // ─── MyPage / Ecount navigation ─────────────────────────────────────────
  {
    id: "mypage-flow-chart",
    title: "Where do I start? MyPage Flow Chart",
    scenario:
      "You do not know which screen to open for sales, purchases, cash in/out, or stock — or you opened the wrong menu and filed a ticket.",
    intro:
      "Open Home → MyPage. Use Learn to use BluearmERP for common lists and vouchers, or the Flow Chart to walk Quotation→Sales→Receipt and PR→PO→GR→Purchase→Pay. Use the top strip (Inv. I / Inv. II / Acct. I / Acct. II) like Ecount modules.",
    blocks: [
      {
        type: "steps",
        items: [
          "Go to /app/dashboard (Home / MyPage).",
          "Click the Flow Chart node for the step you need — do not invent a parallel screen.",
          "After Sales save, choose Cash In; after Purchase save, choose Cash Payment — same as Ecount prompts.",
          "Use Site Map (/app/dashboard/site-map) to search menu names.",
        ],
      },
      {
        type: "tip",
        text: "Wrong-screen tickets usually mean skipping MyPage. Bookmark Home and follow the chain left to right.",
      },
    ],
    primaryHref: "/app/dashboard",
    primaryLabel: "Open MyPage",
    relatedGuideIds: ["load-slip-overview", "official-receipt-after-si", "payment-voucher-after-purchase"],
  },
  // ─── P0: Blockers & confusion ───────────────────────────────────────────
  {
    id: "cannot-confirm-document",
    title: "Cannot confirm a document — checklist",
    scenario:
      "You try to Confirm, Complete, or e-Approve a quotation, sales order, sale, purchase order, or purchase and the form blocks you.",
    intro:
      "Confirm is blocked until foundation setup, process policy gates, required fields, and attachment rules are satisfied. Work through this checklist before contacting support.",
    blocks: [
      {
        type: "steps",
        items: [
          "Finish workspace foundation at /app/setup if the banner says setup is incomplete — quotations and purchases are blocked until Confirm seeds + partners + products.",
          "Fill every required field (red asterisk). Progress status on quotations defaults to Unconfirmed; leave it set unless your store requires another value.",
          "If attachment rules are ON, upload at least one file in Attachments, Save once, then Confirm.",
          "Purchase orders: save in the modal with attachments, then Confirm from the Purchase Order list.",
          "Check User Management → Process policies for gates such as Sales require SO, Sales require quotation, or GR before supplier invoice.",
        ],
      },
      {
        type: "tip",
        text: "Common messages: “Please fill in required fields…”, “Attach a file before confirming”, foundation incomplete, or policy requiring a prior document. Fix the named cause, then retry Confirm.",
      },
    ],
    primaryHref: "/app/user-management/process-policies",
    primaryLabel: "Process policies",
    relatedGuideIds: [
      "attachment-requirements",
      "document-attachments-workflow",
      "process-policies-foundation",
      "setup-wizard",
    ],
  },
  {
    id: "quotation-rfq-unregistered-products",
    title: "Quotation / RFQ with products not yet in inventory",
    scenario:
      "You need to save or print a quotation or RFQ before the product is registered in Inventory — BluearmERP fast track.",
    intro:
      "Quotations, RFQs, and purchase requests allow free-text product code/name without an inventory item. Registration becomes required when you create a sales order, sales invoice, purchase order, or purchase (supplier invoice).",
    blocks: [
      {
        type: "steps",
        items: [
          "On New Quotation or New RFQ, type the product name (and optional code) directly in the line — double-click Item Code only if you want to pick from inventory.",
          "Save and print as usual; PDF uses the typed name/code.",
          "Before Sales Order, Sales, Purchase Order, or Purchases: open Inventory → Items, create the product, then edit the quotation/RFQ/PR line (or re-pick) so item_id is set.",
          "Load Slip into SO/PO only lists lines that already have a registered inventory item — free-text lines stay on the source document until linked.",
        ],
      },
      {
        type: "tip",
        text: "Error “Register the product in Inventory before saving…” means you reached an inventory-gated document. Create the item first, then retry.",
      },
    ],
    primaryHref: "/app/inventory/items",
    primaryLabel: "Inventory items",
    relatedGuideIds: ["inventory-master-data", "load-slip-overview", "sales-load-slip-so"],
    questions: [
      "product not in inventory quotation",
      "create quotation without product",
      "rfq free text item",
      "unregistered product quote",
      "quotation without item",
    ],
    errorPhrases: [
      "register the product in inventory before saving",
      "inventory registration is optional on quotations",
      "inventory registration is optional on rfq",
      "inventory registration is optional on purchase requests",
      "register free-text rfq products",
    ],
  },
  {
    id: "process-policy-gates-explained",
    title: "Process policy gates (quotation, SO, GR before supplier invoice)",
    scenario:
      "Process policies block the next step — sales require quotation or SO, or goods receipt before supplier invoice — and you need plain-language gates.",
    intro:
      "Process policies enforce commercial flow: quotation before SO, SO before sales invoice, PR approval before PO, and goods receipt before supplier invoice. Admins set gates during setup; members see blocks when a required prior document is missing.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open User Management → Process policies (admin).",
          "Review selling gates: require quotation before SO, require SO before sales invoice, SO release mode (legacy vs delivery receipt).",
          "Review buying gates: require PR approval before PO, require goods receipt before supplier invoice (GR before SI).",
          "Review attachment rules per document type — ON means Confirm needs a file.",
          "Confirm policies during /app/setup/process-policies before first live transactions.",
        ],
      },
      {
        type: "tip",
        text: "Policy gate “goods receipt before supplier invoice” means you must post a GR (or use a policy that allows SI from PO only). This is not the same as Load Slip from GR — fix the policy or post the GR first. Pre-Invoicing Status shows unbilled receipts.",
      },
    ],
    primaryHref: "/app/user-management/process-policies",
    primaryLabel: "Open process policies",
    relatedGuideIds: ["process-policies-foundation", "purchase-request-to-ap-flow", "quotation-to-sales-flow"],
  },
  {
    id: "foundation-setup-blocked-api",
    title: "Transactions blocked until foundation setup",
    scenario:
      "You cannot create quotations, sales, purchases, or POS sales because workspace foundation is incomplete.",
    intro:
      "The API blocks transactional POST until required setup steps are complete. Inventory and finance configuration screens stay available while you finish foundation.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open /app/setup or the Dashboard Start here checklist.",
          "Complete Confirm seeds, partners (customers/suppliers), and products/items.",
          "Confirm process policies and attachment rules.",
          "When all required steps show complete, create your first quotation or purchase request.",
          "Invited users who join mid-setup should ask an admin to finish foundation or use Skip / Remind later only for exploration.",
        ],
      },
      {
        type: "tip",
        text: "Demo tenants can load Demo Data after foundation. Real companies should not skip partners and items — every document needs them.",
      },
    ],
    primaryHref: "/app/setup",
    primaryLabel: "Open setup",
    relatedGuideIds: ["setup-wizard", "onboarding-playbook", "invited-during-setup"],
  },
  {
    id: "sales-return-serial",
    title: "Sales return with serial numbers",
    scenario: "A customer returns a serial-tracked unit and you need stock and serial status restored correctly.",
    intro:
      "Sales returns reverse invoiced quantity. For Track serial items, you must scan or select the same serial units that left stock so the registry returns them to available.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Sales → Sales Returns and create a return linked to the original sales invoice when possible.",
          "Add lines for the returned items and quantities.",
          "On Track serial lines, use the serial scan box to accept each returning unit (count must match qty).",
          "Save and confirm the return so inventory and serial status update.",
          "Verify the serial in Serial & Lot registry — it should no longer show as sold on that invoice.",
        ],
      },
      {
        type: "tip",
        text: "If scan is rejected, the serial may still be in stock, belong to another invoice, or not exist. Trace the serial first under Inventory → Serial & Lot.",
      },
    ],
    primaryHref: "/app/sales/sales-returns",
    primaryLabel: "Sales returns",
    relatedGuideIds: ["serial-barcode-scanning", "serial-lot-registry"],
  },
  {
    id: "serial-count-mismatch",
    title: "Serial scan count does not match quantity",
    scenario:
      "You cannot save a goods receipt, sales invoice, POS ticket, or SO release because serial count does not equal line quantity.",
    intro:
      "Track serial items require exactly one accepted serial per unit on the line. The server rejects saves when scanned count ≠ qty.",
    blocks: [
      {
        type: "steps",
        items: [
          "Confirm the item master has Track serial enabled on the Serial / Lot tab.",
          "Set line quantity to the number of physical units you are receiving or selling.",
          "Scan or enter each serial in the serial box until the accepted count equals qty.",
          "Remove duplicate or wrong scans before saving.",
          "On goods receipt, receive serials into stock; on sales/POS, diminish stock with sold serials.",
        ],
      },
      {
        type: "tip",
        text: "Partial receive: lower the line qty to match what you scanned, or finish scanning the remaining units. Do not leave qty higher than accepted serials.",
      },
    ],
    primaryHref: "/app/inventory/serial-lot/receive",
    primaryLabel: "Serial receive",
    relatedGuideIds: ["serial-barcode-scanning", "goods-receipt-serial-receive", "pos-checkout-guide"],
  },
  {
    id: "official-receipt-after-si",
    title: "Official receipt (Cash In) after sales invoice",
    scenario: "You saved a sales invoice and need to record customer payment / official receipt.",
    intro:
      "Cash In / Official Receipt collects AR against sales invoices. You can open it from the invoice after save or from Finance → Receipts.",
    blocks: [
      {
        type: "steps",
        items: [
          "Save the sales invoice so it has a document number.",
          "Use Cash In on the invoice (when offered) or open Finance → Official Receipts → New.",
          "Select the customer and allocate payment to the open invoice balance.",
          "Choose payment method and bank/cash account, then save/post per your store rules.",
          "Confirm Receivable Status or Customer Book shows the balance reduced.",
        ],
      },
      {
        type: "tip",
        text: "Partial collections are allowed — allocate less than the full invoice. Remaining balance stays open on AR reports.",
      },
    ],
    primaryHref: "/app/finance/official-receipts",
    primaryLabel: "Official receipts",
    relatedGuideIds: ["sales-cash-in-after-save", "receivable-payable-status", "finance-accounts-overview"],
  },
  {
    id: "payment-voucher-after-purchase",
    title: "Payment voucher after supplier invoice",
    scenario: "You posted a purchase (supplier invoice) and need to pay the vendor.",
    intro:
      "Payment vouchers (Cash Payment) clear AP. Start from the purchase after save or from Finance → Vouchers.",
    blocks: [
      {
        type: "steps",
        items: [
          "Save the supplier invoice / purchase document.",
          "Use Cash Payment on the document or open Finance → Payment Vouchers → New.",
          "Select the vendor and allocate to open purchase balances.",
          "Choose payment method and cash/bank account, then save.",
          "Check Payable Status or Vendor Book for the updated balance.",
        ],
      },
      {
        type: "tip",
        text: "If GR-before-SI policy is on, ensure goods were received and the purchase was created via Load Slip from GR or an allowed PO path before paying.",
      },
    ],
    primaryHref: "/app/finance/payment-vouchers",
    primaryLabel: "Payment vouchers",
    relatedGuideIds: ["purchase-cash-payment-after-save", "receivable-payable-status", "goods-receipt-load-slip"],
  },
  {
    id: "chart-of-accounts-ph-template",
    title: "Chart of Accounts — standard PH SME chart and mappings",
    scenario:
      "You need to review the default chart of accounts, reload the Philippine SME template on an empty chart, or fix Purchases / COGS mappings.",
    intro:
      "New workspaces receive a standard Philippine SME chart of accounts automatically (general ledger only — not bank account registers). If the chart was cleared, import the PH SME template again. Then open Default account mappings and set Purchases / COGS (expense 5010), sales revenue, cash, AR/AP, and VAT accounts.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Accounting Dept → General ledger → Chart of accounts (/app/finance/acct-i/chart-of-accounts).",
          "If the list is empty, choose Use standard Philippine chart to reload accounts and default mappings.",
          "Review account types (asset, liability, equity, income, expense) and rename codes to match your books if needed.",
          "Open Default account mappings. Set Purchases / COGS to an expense account — usually 5010 Cost of Goods Sold. Do not use inventory asset 1469 here.",
          "If the Purchases / COGS dropdown is empty, use Create Purchases / COGS (5010) or re-import the PH template so expense accounts exist.",
          "Click Save mappings. Soft-deleted accounts stay hidden from pickers until restored.",
        ],
      },
      {
        type: "tip",
        text: "Bank accounts (for deposits and transfers) are a separate banking setup. Chart of accounts cash lines are GL posting accounts only.",
      },
      {
        type: "tip",
        text: "On supplier invoices the field is labeled Purchases / COGS. It only lists expense accounts. Inventory merchandise (1469) is an asset and will not appear in that list.",
      },
    ],
    primaryHref: "/app/finance/acct-i/chart-of-accounts?focus=purchase#default-account-mappings",
    primaryLabel: "Purchases / COGS mappings",
    relatedGuideIds: ["finance-accounts-overview", "finance-je-draft-to-post", "coa-soft-delete-restore"],
  },
  {
    id: "coa-soft-delete-restore",
    title: "Soft-delete and restore a GL account",
    scenario: "You need to retire a chart-of-accounts line without breaking history, or bring it back.",
    intro:
      "Chart of Accounts uses soft delete. Deleted accounts leave historical journals intact but stop appearing in new document account pickers until restored.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Accounting Dept → General ledger → Chart of accounts.",
          "Find the account and use Delete / Archive (soft delete).",
          "Confirm it no longer appears in active pickers for new journals or documents.",
          "To restore, show inactive/deleted accounts (filter) and Restore the row.",
          "Re-check finance defaults if the deleted account was mapped as a default cash/AR/AP account.",
        ],
      },
      {
        type: "tip",
        text: "Prefer soft delete over reusing codes. Reusing a code for a different meaning confuses reports and auditors.",
      },
    ],
    primaryHref: "/app/finance/acct-i/chart-of-accounts",
    primaryLabel: "Chart of Accounts",
    relatedGuideIds: ["chart-of-accounts-ph-template", "finance-accounts-overview"],
  },
  {
    id: "operations-calendar-day-today",
    title: "Operations calendar: Today and hourly day view",
    scenario:
      "You open Operations → Calendar and want Google Calendar–style hourly layout for today, or timed tasks by hour.",
    intro:
      "Month and week show dated tasks. Today jumps to Day view for the current date with an all-day strip and 0–23 hour grid. Timed work items use start/end time; date-only items stay all-day.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Operations → Calendar and select a workspace.",
          "Click Today to jump to the current date in Day view (or choose Day in Month / Week / Day).",
          "All-day tasks appear in the top strip; timed tasks appear on the hour grid.",
          "Click an hour row to create a timed task (default one-hour slot), or + All-day task for date-only.",
          "Uncheck All day in the task form to set start/end times; save — the card also appears on the Kanban board.",
          "Click a day number in month/week to open that day. Use ‹ › to move one day in Day view.",
        ],
      },
      {
        type: "tip",
        text: "In Day view, drag an event to move it or drag the bottom edge to resize. Set a reminder on the task form — toasts fire while Calendar is open; allow browser notifications for desktop alerts (migration 160).",
      },
    ],
    primaryHref: "/app/operations/calendar",
    primaryLabel: "Operations calendar",
    relatedGuideIds: ["operations-hub-intro", "operations-packs-edit", "work-item-link-erp-doc"],
  },
  {
    id: "operations-packs-edit",
    title: "Edit Operations industry packs",
    scenario: "You want to rename a pack, change board columns, or understand why a system pack is read-only.",
    intro:
      "Tenant packs define starter boards (columns, samples, rules). You can edit custom packs; system packs are view-only. Applying a pack seeds a workspace board.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Operations → Packs.",
          "Select a pack. System packs show as view-only — duplicate or create a tenant pack to customize.",
          "Edit name, description, and columns (keys and display names).",
          "Save — column-only updates do not wipe samples, automation rules, or widgets.",
          "Apply the pack to a workspace from the hub when you need a new board layout.",
        ],
      },
      {
        type: "tip",
        text: "Changing columns on a live workspace is separate from editing the pack template. Pack edit changes future applies; existing boards keep their columns until you change the workspace board.",
      },
    ],
    primaryHref: "/app/operations/packs",
    primaryLabel: "Operations packs",
    relatedGuideIds: ["operations-hub-intro", "operations-calendar-day-today"],
  },
  {
    id: "missing-menu-permission",
    title: "Menu or screen is missing",
    scenario: "You cannot find a module in the sidebar, or a page says you lack permission.",
    intro:
      "Menus follow enabled modules and role permissions. If a screen is missing, an admin must enable the module and grant the permission code on your role.",
    blocks: [
      {
        type: "steps",
        items: [
          "Confirm you are in the correct business (tenant) and branch.",
          "Ask an admin to open User Management → Roles and check your role permissions for that module (for example operations.work_items, finance.journal_entries).",
          "Ask an admin to enable the module under User Management / module settings if the whole product area is off.",
          "Sign out and back in after permission changes.",
          "If the route opens but Save fails, you may have read without write — request write on the matching *_new or entity permission.",
        ],
      },
      {
        type: "tip",
        text: "Platform admins and store admins see more menus than members. Compare with a known admin account to see whether the issue is role vs module entitlement.",
      },
    ],
    primaryHref: "/app/user-management",
    primaryLabel: "User management",
    relatedGuideIds: ["user-management-admin", "switch-between-businesses"],
  },

  // ─── P1: High-traffic paraphrases ───────────────────────────────────────
  {
    id: "quotation-progress-status",
    title: "Quotation progress status",
    scenario:
      "Progress status on a quotation confuses you, or save warns about Progress status even when Unconfirmed looks selected.",
    intro:
      "Progress status tracks commercial state (for example Unconfirmed → later stages). It should default to Unconfirmed on new quotes and is not meant as a hard required blank field.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open a new quotation — Progress status should show Unconfirmed by default.",
          "Leave it alone unless your store process uses later statuses before Confirm.",
          "If the form complains about Progress status, re-select Unconfirmed, save again, and ensure form field settings did not hide the control while marking it required.",
          "Admins can adjust field visibility under form field settings; Progress status should not be a stale required override.",
        ],
      },
      {
        type: "tip",
        text: "Confirm / Completed still follows attachment and foundation rules. Progress status alone does not replace Confirm.",
      },
    ],
    primaryHref: "/app/quotation/quotations/new",
    primaryLabel: "New quotation",
    relatedGuideIds: ["cannot-confirm-document", "form-field-settings", "quotation-to-sales-flow"],
  },
  {
    id: "quotation-rfq-ai-import",
    title: "Import RFQ / quotation lines with AI assist",
    scenario: "You have a customer RFQ PDF or BOQ and want to parse lines into a quotation instead of typing every row.",
    intro:
      "Quotation RFQ import can parse pages/tables and match lines to items. AI assist (when configured on the server) helps extraction; matching still uses your item master.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Quotation → New Quotation (or the RFQ import entry on the quotation screen).",
          "Upload the customer RFQ PDF or provide page/table payload per the import UI.",
          "Review parsed lines — fix quantities, descriptions, and unmatched items.",
          "Match lines to stock items (SKU search) before saving.",
          "Save the quotation, then continue the normal quote → SO → invoice flow.",
        ],
      },
      {
        type: "tip",
        text: "Server needs DashScope / RFQ AI config when using model-assisted parse. Without AI, structural parse + manual match still works. See docs/runbooks/dashscope-rfq-ai.md for operators.",
      },
    ],
    primaryHref: "/app/quotation/quotations/new",
    primaryLabel: "New quotation",
    relatedGuideIds: ["quotation-to-sales-flow", "rfq-workflow", "inventory-master-data"],
  },
  {
    id: "mapping-center-when-to-use",
    title: "Mapping Center vs Load Slip",
    scenario: "You are unsure whether to convert documents from Mapping Center or use Load Slip on a new form.",
    intro:
      "Both copy lines between documents. Load Slip is fastest when the destination form is already open. Mapping Center is for list-driven bulk convert with tenant mapping rules.",
    blocks: [
      {
        type: "steps",
        items: [
          "Use Load Slip on New Sales Order, New Sale, New PO, New Purchase, etc. when you already opened the target document.",
          "Use Mapping Center when converting selections from a list with saved tenant rules (quote→SO, SO→invoice, PR→PO, GR→SI).",
          "Confirm residual quantities — both paths respect open balances.",
          "After convert, open the new document and continue confirm / release / receive as usual.",
        ],
      },
      {
        type: "tip",
        text: "If Load Slip shows no lines, the source has no open residual qty, wrong partner, or policy blocks that path.",
      },
    ],
    primaryHref: "/app/user-management/mapping-center",
    primaryLabel: "Mapping Center",
    relatedGuideIds: ["load-slip-overview", "quotation-to-sales-flow", "goods-receipt-load-slip"],
  },
  {
    id: "delivery-receipt-vs-shipping",
    title: "Delivery receipt vs shipping order vs SO release",
    scenario: "You need to ship or issue stock and are confused among pick list / release, shipping order, and delivery receipt.",
    intro:
      "SO release (pick list) allocates or issues stock depending on process policy. Shipping orders plan outbound shipments. Delivery receipts (when used) record delivery and can drive stock issue in split-release mode.",
    blocks: [
      {
        type: "steps",
        items: [
          "Check process policy SO release mode: legacy combines reservation+issue; split mode uses delivery receipts to issue.",
          "Use Sales Order → Pick List / Release to reserve or issue per that policy.",
          "Create a shipping order from sales lines when you need warehouse outbound planning.",
          "Invoice with Load Slip → Sales Order or Load Slip → Shipping Order after fulfillment.",
          "Use Pre-Invoicing Status (Sales) to see delivered/released but unbilled lines.",
        ],
      },
      {
        type: "tip",
        text: "Do not create duplicate issues. If stock already left on release, invoicing should bill residual — not re-issue quantity.",
      },
    ],
    primaryHref: "/app/sales-order",
    primaryLabel: "Sales orders",
    relatedGuideIds: ["sales-order-release", "wms-and-shipping", "sales-load-slip-shipping"],
  },
  {
    id: "goods-receipt-serial-receive",
    title: "Goods receipt with serial numbers",
    scenario: "Vendor delivery includes serial-tracked items and you must post GR with serials into stock.",
    intro:
      "Post the goods receipt against the PO, then scan serials on Track serial lines until count matches qty. Serials become available in the registry.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Goods Receipt and Load Slip from the purchase order (or create GR linked to PO).",
          "Set received quantities for each line.",
          "On Track serial lines, scan each unit until accepted count equals received qty.",
          "Post / confirm the goods receipt.",
          "Optionally create the supplier invoice via Load Slip → Goods Receipt.",
        ],
      },
      {
        type: "tip",
        text: "If serial already exists in stock, the receive scan will fail — trace the serial before forcing a duplicate.",
      },
    ],
    primaryHref: "/app/purchase-order/goods-receipt",
    primaryLabel: "Goods receipts",
    relatedGuideIds: ["serial-count-mismatch", "serial-barcode-scanning", "goods-receipt-load-slip"],
  },
  {
    id: "lot-expiry-pick-rules",
    title: "Lot / batch pick and expiry on sales",
    scenario: "You sell lot-tracked goods and must choose which batch ships, often preferring earlier expiry.",
    intro:
      "Track lot items require a batch on the sales (or issue) line. Pick a lot with enough available qty; prefer FEFO when your store practices it.",
    blocks: [
      {
        type: "steps",
        items: [
          "Confirm the item has Track lot on the Item → Serial / Lot tab.",
          "On the sales or shipping line, open lot / batch pick.",
          "Choose a batch with available quantity (and acceptable expiry).",
          "Save the document — qty cannot exceed remaining batch qty.",
          "Use Serial & Lot registry to inspect batch balances and traces.",
        ],
      },
      {
        type: "tip",
        text: "If no batches appear, receive stock first (GR or branch receive) with lot numbers. Sales cannot invent batches.",
      },
    ],
    primaryHref: "/app/sales",
    primaryLabel: "Sales",
    relatedGuideIds: ["sales-lot-batch-pick", "item-serial-lot-tab", "serial-lot-registry"],
  },
  {
    id: "po-confirm-from-list",
    title: "Confirm a purchase order from the list",
    scenario: "You saved a PO in the modal but Confirm is not finishing from the form — or attachments block confirm.",
    intro:
      "Purchase orders are often confirmed from the list after modal save, especially when attachment rules require a file first.",
    blocks: [
      {
        type: "steps",
        items: [
          "Fill the PO, add attachments if required, and Save in the modal so the PO gets a number.",
          "Close the modal and open Purchase Order list.",
          "Select the draft PO and use Confirm (list action).",
          "After confirm, receive with Goods Receipt and/or bill with supplier invoice Load Slip.",
        ],
      },
      {
        type: "tip",
        text: "If Confirm is disabled, check attachments, approvals, and your write permission on purchase orders.",
      },
    ],
    primaryHref: "/app/purchase-order",
    primaryLabel: "Purchase orders",
    relatedGuideIds: ["document-attachments-workflow", "purchase-request-to-ap-flow", "cannot-confirm-document"],
  },
  {
    id: "pr-approval-stuck",
    title: "Purchase request stuck in approval",
    scenario: "A purchase request waits for approval and nobody can create the PO yet.",
    intro:
      "When PR approval is required by process policy, managers must approve in the approvals queue before PO Load Slip from PR is allowed.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Approvals (document approvals queue) as a user with approve permission.",
          "Find the purchase request and Approve (or Reject with a note).",
          "Requester: refresh the PR — status should show approved.",
          "Create PO via Load Slip → Purchase Request on New Purchase Order.",
          "Admins: if approval is not desired, turn off PR approval in Process policies.",
        ],
      },
      {
        type: "tip",
        text: "Wrong approver role is the usual cause. Grant approval permission on the manager role, not only document create.",
      },
    ],
    primaryHref: "/app/dashboard/approvals",
    primaryLabel: "Approvals",
    relatedGuideIds: ["approvals-queue", "purchase-order-load-slip-pr", "process-policy-gates-explained"],
  },
  {
    id: "bank-rec-unmatched-lines",
    title: "Bank reconciliation — unmatched statement lines",
    scenario: "Bank statement lines will not match to official receipts or payment vouchers.",
    intro:
      "Match statement rows to posted receipts/vouchers by amount and date. Unmatched lines stay open until you create the missing payment document or adjust the match.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Accounting Dept → General ledger → Bank reconciliation.",
          "Import or enter statement lines for the bank account and period.",
          "For each line, match to an official receipt (inflow) or payment voucher (outflow) with the same amount.",
          "If nothing matches, create the missing OR/PV first, then return to reconciliation.",
          "Complete the reconciliation when remaining unmatched difference is explained.",
        ],
      },
      {
        type: "tip",
        text: "Fees and transfers may need a journal entry before they can match. Do not force-match different amounts.",
      },
    ],
    primaryHref: "/app/finance/acct-i/bank-reconciliation",
    primaryLabel: "Bank reconciliation",
    relatedGuideIds: ["bank-reconciliation-weekly", "official-receipt-after-si", "payment-voucher-after-purchase"],
  },
  {
    id: "je-wont-post",
    title: "Journal entry will not post",
    scenario: "A journal entry stays in draft or post fails (unbalanced, period closed, missing accounts).",
    intro:
      "Journals must balance (debits = credits), use active COA accounts, and fall in an open fiscal period before post.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Accounting Dept → General ledger → Journal entries and open the draft.",
          "Check line debits and credits sum to the same total.",
          "Replace soft-deleted or blank accounts with active Chart of Accounts codes.",
          "Confirm the posting date is inside an open fiscal year and open month (Accounting → General ledger → Fiscal years).",
          "Use Review then Post (per your workflow). Sales/purchase auto-journals follow document post rules.",
        ],
      },
      {
        type: "tip",
        text: "Empty COA is uncommon on new tenants (a standard chart is loaded automatically). If accounts were cleared, use Use standard Philippine chart, then post. Lock finished months with Close month, or lock the whole year with Close year — reopen only for correcting entries.",
      },
    ],
    primaryHref: "/app/finance/acct-i/journal-entries",
    primaryLabel: "Journal entries",
    relatedGuideIds: ["finance-je-draft-to-post", "chart-of-accounts-ph-template", "finance-accounts-overview"],
  },
  {
    id: "multi-branch-defaults",
    title: "Active branch vs document location",
    scenario: "Stock lists look wrong for a warehouse, or a document posts to the unexpected branch.",
    intro:
      "Active branch sets the default location on new documents and switcher context. Owners and company admins still see all branches on document lists unless they filter. Branch-scoped staff (role with Apply user data scopes + assigned locations) only see their assigned branch documents.",
    blocks: [
      {
        type: "steps",
        items: [
          "Switch Active branch from the branch switcher to the warehouse you are working in — new quotes, orders, and receipts default to that location.",
          "When creating SO, GR, transfers, or issues, confirm the location field matches that branch.",
          "Use Stock transfer between branches when goods physically move — do not only switch active branch.",
          "Use Find Stock (or Inventory Status with Branch = All) to inquire qty across branches; document write access remains scoped for branch staff.",
        ],
      },
      {
        type: "tip",
        text: "Active branch is not the same as switching business (tenant). Use business switcher for another company workspace.",
      },
    ],
    primaryHref: "/app/inventory",
    primaryLabel: "Inventory",
    relatedGuideIds: ["switch-active-branch", "transfer-stock-between-branches", "switch-tenant-vs-branch"],
  },
  {
    id: "switch-tenant-vs-branch",
    title: "Switch business vs switch branch",
    scenario: "You need another company workspace or another warehouse and used the wrong switcher.",
    intro:
      "Business (tenant) switch changes company data entirely. Branch switch stays inside the same company and changes default location context.",
    blocks: [
      {
        type: "steps",
        items: [
          "To work in another company: use Switch business / workspace (multi-tenant login).",
          "To work in another warehouse under the same company: use Active branch.",
          "Confirm the header shows the expected company name and branch label before posting documents.",
          "Invite users per business — access does not automatically include every tenant.",
        ],
      },
      {
        type: "tip",
        text: "Documents never move between businesses when you switch branch. Wrong-company postings require the business switcher.",
      },
    ],
    primaryHref: "/app/dashboard",
    primaryLabel: "Dashboard",
    relatedGuideIds: ["switch-between-businesses", "switch-active-branch", "add-another-business"],
  },
  {
    id: "gmail-comms-connect",
    title: "Connect Gmail and document email",
    scenario: "You want Sent Documents logging, SMTP delivery, and optional Gmail sync for inbox threads.",
    intro:
      "Email on documents queues PDF sends through server SMTP. Communications logs sent mail. Optional Gmail OAuth connects inbox sync under Communications → Settings.",
    blocks: [
      {
        type: "steps",
        items: [
          "Save a document, click Email, and send — check Communications → Sent Documents.",
          "Operators: configure SMTP_HOST and SMTP_FROM on the API for outbound delivery.",
          "For Gmail sync, open Communications → Settings and connect Gmail (OAuth).",
          "Use Inbox to read synced threads linked to quotations, orders, and invoices.",
          "Grant Communications → Send permission to users who should email documents.",
        ],
      },
      {
        type: "tip",
        text: "Sent log can succeed while SMTP is misconfigured — check server logs if customers never receive mail.",
      },
    ],
    primaryHref: "/app/comms/settings",
    primaryLabel: "Communications settings",
    relatedGuideIds: ["communications-overview", "document-email-workflow"],
  },
  {
    id: "work-item-link-erp-doc",
    title: "Link an Operations work item to an ERP document",
    scenario: "You want a Kanban card tied to a quotation, PO, or other ERP document for traceability.",
    intro:
      "Work items support document links. From the work item editor, search and attach ERP docs so the board stays connected to commercial records.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Operations Hub and edit (or create) a work item.",
          "Open the links / ERP documents panel on the item.",
          "Search by document type and reference, then add the link.",
          "Save — open the link later to jump back to the document.",
          "Optional: set dates/times so the item also appears on Operations → Calendar.",
        ],
      },
      {
        type: "tip",
        text: "Duplicate links to the same doc type+id are rejected. Remove the old link before re-adding.",
      },
    ],
    primaryHref: "/app/operations",
    primaryLabel: "Operations Hub",
    relatedGuideIds: ["operations-hub-intro", "operations-calendar-day-today", "crm-operations-tasks-sync"],
  },
  {
    id: "custom-field-required-block",
    title: "Required custom field blocks save",
    scenario: "Save fails because a custom field is required, or a field you do not see is marked required.",
    intro:
      "Form field settings and inline custom fields can mark values required. Hidden-but-required fields still block save — fix visibility or clear the required flag.",
    blocks: [
      {
        type: "steps",
        items: [
          "Read the validation message for the field label.",
          "If the field is visible, fill it and save again.",
          "Admins: open form field settings for that document type — uncheck Required or set Visible if users need it.",
          "For inline custom fields created on the form, edit the field definition and relax Required.",
          "Retry save after settings refresh (re-open the modal if needed).",
        ],
      },
      {
        type: "tip",
        text: "Progress status had a known stale required override — see Quotation progress status. Prefer DefaultRequired false for status-like fields.",
      },
    ],
    primaryHref: "/app/quotation/quotations/settings",
    primaryLabel: "Quotation field settings",
    relatedGuideIds: ["form-field-settings", "inline-custom-fields", "quotation-progress-status"],
  },

  // ─── P2: Module depth ───────────────────────────────────────────────────
  {
    id: "manufacturing-wo-issue-complete",
    title: "Manufacturing: issue components and complete a work order",
    scenario: "You assemble finished goods and need to issue BOM components then complete the work order into stock.",
    intro:
      "Work orders backflush component stock (converted to each item’s base UoM, with scrap and yield) and receive finished goods in the finished item’s base unit.",
    blocks: [
      {
        type: "steps",
        items: [
          "Set item base units and conversions under Inventory → Units.",
          "Maintain a BOM with output qty/UoM, yield %, and component lines (qty, UoM, scrap %).",
          "Create a work order, review materials needed vs on-hand, then release.",
          "Complete the work order to issue converted stock and receive finished goods.",
        ],
      },
      {
        type: "tip",
        text: "Insufficient converted stock blocks complete — transfer/receive components or fix conversions first. Complete always uses the live BOM.",
      },
    ],
    primaryHref: "/app/inventory/serial-lot/manufacturing/work-orders",
    primaryLabel: "Work Orders",
    relatedGuideIds: ["manufacturing-bom", "serial-lot-registry"],
  },
  {
    id: "job-costing-link-expenses",
    title: "Job costing: link costs to a project",
    scenario: "You track project budgets and need labor or purchase costs on the job.",
    intro:
      "Job costing projects collect costs against a job code. Link purchases, labor, or journals to the project to compare budget vs actual.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create or open the job/project under Job Costing.",
          "Set budget amounts for materials and labor as needed.",
          "When entering related POs, purchases, or time, select the job/project reference.",
          "Review job cost reports for actual vs budget.",
          "Optional: link Operations work items or CRM tasks to the same project context.",
        ],
      },
      {
        type: "tip",
        text: "Costs without a job code will not appear on the project — set the reference before posting.",
      },
    ],
    primaryHref: "/app/operations/job-costing",
    primaryLabel: "Job costing",
    relatedGuideIds: ["job-costing-projects", "operations-hub-intro"],
  },
  {
    id: "quality-ncr-capa-loop",
    title: "Quality: NCR to CAPA loop",
    scenario: "You found a non-conformance and need corrective / preventive action tracked to close.",
    intro:
      "NCRs document the problem; CAPA records root cause and actions. Link them so quality issues close with evidence.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Quality and create an NCR with product, lot/serial, and description.",
          "Assign an owner and due date.",
          "Create a CAPA from the NCR (or link an existing CAPA).",
          "Record root cause, corrective steps, and verification.",
          "Close the NCR when CAPA verification is done.",
        ],
      },
      {
        type: "tip",
        text: "Include serial/lot on the NCR when inventory quality is involved — it speeds trace recalls.",
      },
    ],
    primaryHref: "/app/quality",
    primaryLabel: "Quality",
    relatedGuideIds: ["quality-ncr-capa", "serial-lot-registry"],
  },
  {
    id: "wms-scheduled-receipt-variance",
    title: "WMS scheduled receipt — expected vs actual",
    scenario: "A dock appointment expected certain qty but actual receive differs.",
    intro:
      "Scheduled inbound receipts plan expected lines. When posting actual GR/receive, compare variance and update the schedule status.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open WMS scheduled receipts and select the appointment.",
          "Review expected SKU and qty.",
          "Post the actual goods receipt / inbound with real quantities.",
          "Note short/over receipts as variance on the schedule.",
          "Close or reschedule remaining expected qty.",
        ],
      },
      {
        type: "tip",
        text: "Serial/lot rules on actual receive still apply — schedule does not bypass Track serial counts.",
      },
    ],
    primaryHref: "/app/inventory/wms/scheduled-receipts",
    primaryLabel: "WMS scheduled receipts",
    relatedGuideIds: ["wms-scheduled-receipts", "goods-receipt-serial-receive"],
  },
  {
    id: "customer-portal-what-they-see",
    title: "Customer portal — what customers can see",
    scenario: "You want customers to view their orders and invoices without full ERP access.",
    intro:
      "The customer portal is read-only. Customers see their own documents after portal access is enabled for the partner.",
    blocks: [
      {
        type: "steps",
        items: [
          "Enable portal access for the customer partner (admin).",
          "Share portal login instructions with the customer contact.",
          "Customer signs in and opens orders / invoices available to their partner id.",
          "ERP users continue to create and confirm documents inside Bluearm as usual.",
          "Revoke portal access on the partner when the relationship ends.",
        ],
      },
      {
        type: "tip",
        text: "Portal users cannot post stock or GL. For edits, they contact your team or open a support ticket.",
      },
    ],
    primaryHref: "/app/inventory/partners",
    primaryLabel: "Open Partners (enable portal access)",
    relatedGuideIds: ["customer-portal", "support-tickets"],
  },
  {
    id: "where-status-reports-live",
    title: "Where status and pre-invoicing reports live",
    scenario: "You need Sales Status, Receivable/Payable Status, or Pre-Invoicing and cannot find the menu.",
    intro:
      "Operational status reports sit under Selling workspace, Purchasing reports, and Finance AR/AP reports. Dashboard cards also deep-link into several of them.",
    blocks: [
      {
        type: "steps",
        items: [
          "Selling workspace / sales reports: Sales Status, Pre-Invoicing Status (Sales).",
          "Purchasing: Pre-Invoicing Status (Purchases) for received-not-billed.",
          "Finance: Receivable Status, Payable Status, Customer/Vendor Book.",
          "Dashboard: open red-flag or KPI tiles to jump into reconciliation views.",
          "Stock reconciliation: Inventory / Stock workspace for serial and release gaps.",
        ],
      },
      {
        type: "tip",
        text: "If a report menu is missing, check module enablement and report permissions (see Menu or screen is missing).",
      },
    ],
    primaryHref: "/app/selling",
    primaryLabel: "Selling workspace",
    relatedGuideIds: [
      "reports-and-dashboard",
      "sales-pre-invoicing-report",
      "purchase-pre-invoicing-report",
      "receivable-payable-status",
    ],
  },
  {
    id: "collective-invoice-edge-cases",
    title: "Collective (group) invoicing edge cases",
    scenario: "Group invoicing skips some orders, doubles lines, or will not include a delivery.",
    intro:
      "Collective invoicing bills multiple sales orders or deliveries on one invoice. Only open residual lines for the same customer are eligible.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Collective / Group invoicing and select the customer.",
          "Select eligible sales orders or deliveries with remaining billable qty.",
          "Review the combined line list — remove lines you must bill separately.",
          "Create the group invoice and confirm attachments/policies as usual.",
          "If an order is missing, check it is not already fully invoiced, on hold, or a different customer/branch.",
        ],
      },
      {
        type: "tip",
        text: "Do not Load Slip the same SO onto a normal invoice after it was fully consumed by a collective invoice.",
      },
    ],
    primaryHref: "/app/sales/collective-invoicing",
    primaryLabel: "Collective invoicing",
    relatedGuideIds: ["collective-invoicing", "sales-load-slip-so", "sales-hold-list"],
  },
  {
    id: "sales-hold-list-resume",
    title: "Resume a sales invoice from Hold list",
    scenario: "You parked a draft sales invoice on Hold and need to finish it later.",
    intro:
      "Sales Hold list stores draft invoices so you can resume without losing lines — BluearmERP Hold.",
    blocks: [
      {
        type: "steps",
        items: [
          "From New Sale, use Hold instead of final save/confirm when you must pause.",
          "Open Sales → Hold list to see parked drafts.",
          "Select the hold row to resume editing.",
          "Finish lines, Load Slip if needed, then Save and Confirm.",
          "Remove or complete the hold entry so it does not linger.",
        ],
      },
      {
        type: "tip",
        text: "Held drafts may still reserve attention but are not posted AR until confirmed as a real invoice.",
      },
    ],
    primaryHref: "/app/sales",
    primaryLabel: "Sales",
    relatedGuideIds: ["sales-hold-list", "sales-load-slip-so"],
  },
  {
    id: "demo-data-golden-scenarios",
    title: "Demo data golden scenarios",
    scenario: "You are on a demo tenant and want to know which sample flows populate for training.",
    intro:
      "Demo Data populate loads idempotent golden scenarios: serial GR→SI, lot sales, delivery flows, PR approval, AP, CRM, Operations Riverside workspace, and Communications samples.",
    blocks: [
      {
        type: "steps",
        items: [
          "Use a DEMO000 / BLUEARM demo tenant as admin.",
          "Open User Management → Demo Data.",
          "Purge demo transactions if you need a clean slate (master data may remain).",
          "Populate (purge-first) to load golden scenarios.",
          "Walk serial receive→invoice, lot sales, open PO receive, Operations demo-riverside-reno, and DEMO-COMMS-* email samples.",
        ],
      },
      {
        type: "tip",
        text: "Do not run demo populate on a production company workspace — it is for training tenants only.",
      },
    ],
    primaryHref: "/app/user-management/demo-data",
    primaryLabel: "Demo data",
    relatedGuideIds: ["demo-data-training", "onboarding-playbook", "operations-hub-intro"],
  },
  {
    id: "bi-reports-overview",
    title: "BI and analytics reports",
    scenario: "You want dashboards or BI beyond operational status reports.",
    intro:
      "Operational KPIs live on the main Dashboard and module workspaces. BI / analytics modules add deeper slices when enabled for your tenant.",
    blocks: [
      {
        type: "steps",
        items: [
          "Start with Dashboard tiles for cash, stock, and open documents.",
          "Use Selling and Finance status reports for day-to-day control.",
          "Open BI (when enabled) for saved analytical views.",
          "Export or print from each report’s toolbar as needed.",
          "Ask an admin to enable BI if the menu is missing.",
        ],
      },
      {
        type: "tip",
        text: "Fix source documents first when BI looks wrong — analytics follow posted transactions.",
      },
    ],
    primaryHref: "/app/dashboard",
    primaryLabel: "Dashboard",
    relatedGuideIds: ["reports-and-dashboard", "where-status-reports-live"],
  },
  {
    id: "hr-payroll-run-basics",
    title: "Run a simple payroll cycle",
    scenario: "You maintain employees and need to process a basic payroll run.",
    intro:
      "HR keeps employee records; payroll runs calculate pay for a period. Complete employee setup before the first run.",
    blocks: [
      {
        type: "steps",
        items: [
          "Add employees under HR with pay basics.",
          "Open Payroll and create a run for the period.",
          "Review calculated lines and adjustments.",
          "Post / finalize per your HR workflow.",
          "Keep payroll GL mapping in finance defaults if you post to accounting.",
        ],
      },
      {
        type: "tip",
        text: "Payroll menus require HR module + permissions — see Menu or screen is missing if hidden.",
      },
    ],
    primaryHref: "/app/hr",
    primaryLabel: "HR",
    relatedGuideIds: ["hr-payroll-basics", "missing-menu-permission"],
  },
  {
    id: "fixed-assets-depreciation-basics",
    title: "Fixed assets and depreciation basics",
    scenario: "You need to register a depreciable asset and understand where depreciation is tracked.",
    intro:
      "Fixed assets register captures asset cost, life, and location. Depreciation follows your asset settings and finance posting practices.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Fixed Assets and create an asset with cost and useful life.",
          "Assign location/branch and GL accounts as required.",
          "Run or review depreciation per your period close process.",
          "Retire or dispose assets with the register actions when sold or scrapped.",
        ],
      },
      {
        type: "tip",
        text: "Align asset GL accounts with Chart of Accounts before posting depreciation journals.",
      },
    ],
    primaryHref: "/app/fixed-assets",
    primaryLabel: "Fixed assets",
    relatedGuideIds: ["fixed-assets-register", "chart-of-accounts-ph-template"],
  },
  {
    id: "support-ticket-from-after-sales",
    title: "Support ticket after a repair or sale",
    scenario: "A customer reports a problem after sale and you need a ticket linked to the case.",
    intro:
      "Support tickets track customer issues. Use them alongside after-sales repair orders when service and support both apply.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Support and create a ticket with customer and description.",
          "Link related repair order or sales document when available.",
          "Assign an owner and priority.",
          "Update status as you investigate; close when resolved.",
          "For device service workflows, also use After-Sales → Repair orders.",
        ],
      },
      {
        type: "tip",
        text: "Portal customers may submit issues that become tickets — monitor the queue daily.",
      },
    ],
    primaryHref: "/app/support",
    primaryLabel: "Support",
    relatedGuideIds: ["support-tickets", "after-sales-repair", "customer-portal-what-they-see"],
  },
  {
    id: "data-center-import-errors",
    title: "Data Center import errors",
    scenario: "Spreadsheet ingestion fails validation or creates partial rows.",
    intro:
      "Data Center file ingestion validates partners, items, or transactions before write. Fix row errors and re-import; do not ignore validation summaries.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Data Center and choose the import type (partners, items, transactions).",
          "Upload the spreadsheet using the template columns expected by that importer.",
          "Read the validation report — fix missing SKUs, partners, or date formats.",
          "Re-upload until errors clear, then commit.",
          "Spot-check a few created records in the live module lists.",
        ],
      },
      {
        type: "tip",
        text: "Import into a demo tenant first when learning mappings. Production imports should be backed up / reversible via purge only when safe.",
      },
    ],
    primaryHref: "/app/data-center/inbox",
    primaryLabel: "Data Center import inbox",
    relatedGuideIds: ["data-center-ingestion", "inventory-master-data"],
  },

  // ─── Quality expansion: common blockers ─────────────────────────────────
  {
    id: "load-slip-no-lines",
    title: "Load Slip shows no lines",
    scenario: "You open Load Slip on a sale, PO, GR, or invoice and the picker is empty or shows no eligible lines.",
    intro:
      "Load Slip only lists open, confirmable source lines that match process policy and remaining quantity. For Sales Order → Sales Invoice, the SO must be Confirmed/Complete with open ordered qty (legacy mode). Serial-tracked items and split-release tenants still need Pick List / delivery first.",
    blocks: [
      {
        type: "steps",
        items: [
          "Confirm the source document (quotation, SO, PR, RFQ, PO, or GR) is Confirmed / Complete — drafts never appear.",
          "For Sales Order → invoice: open Load Slip → Sales Order on New Sale; clear date filters if needed.",
          "Serial-tracked SO lines: release on Sales Order → Pick List before Load Slip.",
          "Split-release stores: post a delivery receipt before Load Slip → Sales Order.",
          "Check remaining qty: fully invoiced lines drop out of the picker.",
          "Match partner and active branch/location to the source document header.",
        ],
      },
      {
        type: "tip",
        text: "Wrong document type in the Load Slip menu (Quotation vs Sales Order vs GR) is a common cause — pick the same source you actually created. Combined invoices “+ New row” opens New Sale; use “Batch eligible sales” only to group existing invoices.",
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "New sales invoice",
    relatedGuideIds: ["load-slip-overview", "sales-load-slip-so", "sales-order-release"],
  },
  {
    id: "insufficient-stock-on-release",
    title: "Insufficient stock on sales order release",
    scenario: "Pick List / Release blocks you with insufficient stock or on-hand too low for the release qty.",
    intro:
      "Release reserves or issues stock from the active branch location. The system rejects release when available qty (and serials, when tracked) cannot cover the lines.",
    blocks: [
      {
        type: "steps",
        items: [
          "Confirm Active branch matches the warehouse that should supply the order.",
          "Check on-hand for each item at that location; receive goods or transfer stock if short.",
          "Lower release qty to available, or split release across later receipts.",
          "For serial items, scan enough accepted serials to equal the release quantity.",
          "Retry Pick List → Release after stock moves post.",
        ],
      },
      {
        type: "tip",
        text: "Stock on another branch does not count until you transfer. Soft allocations on other open orders can also reduce available qty.",
      },
    ],
    primaryHref: "/app/sales-order/sales-orders/release",
    primaryLabel: "Pick List / Release",
    relatedGuideIds: ["sales-order-release", "transfer-stock-between-branches", "serial-count-mismatch"],
  },
  {
    id: "print-or-pdf-failed",
    title: "Print or PDF failed",
    scenario: "Print preview is blank, PDF download fails, or the browser blocks the print window.",
    intro:
      "Most document prints open a dedicated print route in a new tab. Failures are usually popup blockers, missing save/confirm, or a session that expired before the print URL loaded.",
    blocks: [
      {
        type: "steps",
        items: [
          "Save the document first; unsaved drafts often have no printable snapshot.",
          "Allow pop-ups for this site, then use Print / PDF again from the list or detail toolbar.",
          "If the tab opens blank, refresh once while still signed in, or re-open print from the document list.",
          "Try another browser or disable extensions that block downloads/pop-ups.",
          "For collective invoices and packing slips, use the matching Print status / slip action — not a generic browser print of the grid.",
        ],
      },
      {
        type: "tip",
        text: "If every print fails after idle time, sign out and back in — expired sessions commonly break print routes that reload auth.",
      },
    ],
    primaryHref: "/app/sales",
    primaryLabel: "Sales documents",
    relatedGuideIds: ["session-or-signin-issues", "collective-invoicing"],
  },
  {
    id: "empty-list-wrong-branch",
    title: "Empty list — branch scope or filters",
    scenario: "Partners, stock, or documents disappear from a list even though you know they exist.",
    intro:
      "Owners and company admins see documents across all branches; Active branch alone does not empty their grids. Branch-scoped staff only see documents for locations assigned under Data scopes. Stock inquiry (Find Stock) can still show qty at every branch.",
    blocks: [
      {
        type: "steps",
        items: [
          "If you are branch staff: ask an admin to confirm your role has Apply user data scopes and that your user has the correct location(s) under Data scopes.",
          "Clear list filters (date, status, partner, location) that may hide rows.",
          "Open the document and confirm its location/branch field; change it only when you intend to.",
          "Use Stock transfer when goods physically moved — switching Active branch alone does not move inventory.",
          "If the whole company looks empty, you may have switched business (tenant), not branch.",
        ],
      },
      {
        type: "tip",
        text: "Empty Load Slip pickers are often partner/process filters or a mismatched document location — not “owner grid empty because of Active branch.”",
      },
    ],
    primaryHref: "/app/inventory",
    primaryLabel: "Inventory",
    relatedGuideIds: ["multi-branch-defaults", "switch-active-branch", "switch-tenant-vs-branch"],
  },
  {
    id: "write-permission-vs-read",
    title: "Can view but cannot save or confirm",
    scenario: "You can open a screen but Save, Confirm, New, or Release fails or stays disabled.",
    intro:
      "Read permission shows menus and lists. Write (or a specific *_new / action permission) is required to create, update, confirm, or reverse documents.",
    blocks: [
      {
        type: "steps",
        items: [
          "Reproduce once and note the exact action (Save, Confirm, Release, Reverse).",
          "Ask an admin to open User Management → Roles and grant write on the matching permission (for example sales.sales, sales_order.release, purchase_order.goods_receipts).",
          "Some actions use a separate code (release undo, GR reverse, form field settings) — grant that code, not only the parent module.",
          "Sign out and back in after role changes.",
          "If the menu itself is missing, see “Menu or screen is missing” instead.",
        ],
      },
      {
        type: "tip",
        text: "API errors that say you do not have permission are authoritative even when the button looks clickable — fix the role, then retry.",
      },
    ],
    primaryHref: "/app/user-management",
    primaryLabel: "User management",
    relatedGuideIds: ["missing-menu-permission", "user-management-admin"],
  },
  {
    id: "tax-wrong-on-document",
    title: "Tax amount looks wrong on a document",
    scenario: "VAT or tax lines on a quotation, SO, sale, or purchase do not match what you expect.",
    intro:
      "Tax follows the document’s tax type (inclusive vs exclusive), line amounts, and seeded tax codes. Wrong totals usually come from the wrong tax type, stale defaults, or editing price after tax was applied.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Quotation → Tax Management and confirm VAT codes (inclusive vs exclusive) match your pricing practice.",
          "On the document header/lines, pick the intended tax type — do not assume the previous document’s tax carried over.",
          "Re-check unit price: inclusive prices already contain VAT; exclusive prices add tax on top.",
          "Save once so totals recalculate, then compare the tax summary block.",
          "For multi-currency docs, confirm exchange rate and that tax is computed in the document currency.",
        ],
      },
      {
        type: "tip",
        text: "Changing tax type after lines are entered can leave confusing totals — clear or re-enter line prices after switching inclusive/exclusive.",
      },
    ],
    primaryHref: "/app/quotation/tax-mngt/tax-types",
    primaryLabel: "Tax types",
    relatedGuideIds: ["tax-and-currency", "cannot-confirm-document"],
  },
  {
    id: "session-or-signin-issues",
    title: "Session expired or cannot sign in",
    scenario: "You are bounced to sign-in, see unauthorized errors, or password/reset links fail.",
    intro:
      "BluearmERP sessions expire after idle time or when tokens are cleared. Sign-in problems are usually wrong workspace email, expired reset links, or browser storage blocked.",
    blocks: [
      {
        type: "steps",
        items: [
          "Sign out fully, then sign in again with the email invited to this business.",
          "If the app opens but API calls fail, refresh once; if still unauthorized, sign in again.",
          "Use Forgot password for a fresh reset link — old email links expire.",
          "Allow cookies/storage for this site; private mode or blocked third-party cookies can drop sessions.",
          "Confirm you are entering the correct business after login if you belong to multiple companies.",
        ],
      },
      {
        type: "tip",
        text: "Print/PDF and Help votes also need an active session — fix sign-in before treating those as product bugs.",
      },
    ],
    primaryHref: "/signin",
    primaryLabel: "Sign in",
    relatedGuideIds: ["switch-between-businesses", "join-business-by-invite", "print-or-pdf-failed"],
  },
  {
    id: "calendar-drag-and-reminders",
    title: "Calendar: drag, resize, and reminders",
    scenario: "You want to move or lengthen a timed task on the Operations day calendar, or set a reminder before it starts.",
    intro:
      "Day view shows timed work items on an hourly grid. Drag a block to change its start, resize the edge to change duration, or edit times in the task form. Reminder offsets are stored on the work item for notification delivery.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Operations → Calendar, select a workspace, and switch to Day (or click Today).",
          "Drag a timed block up/down the hour grid to move its start time; drag the bottom edge to resize end time.",
          "Alternatively open the task and set Start time / End time (uncheck All day for timed slots).",
          "Choose Reminder: None, 10 minutes, 30 minutes, 1 hour, or 1 day before start — save the task.",
          "Confirm the card still appears on the Kanban board with the updated schedule.",
        ],
      },
      {
        type: "tip",
        text: "All-day tasks live in the top strip and are not resized on the hour grid. Reminder preference is saved even when push/email delivery is still rolling out for your tenant.",
      },
    ],
    primaryHref: "/app/operations/calendar",
    primaryLabel: "Operations calendar",
    relatedGuideIds: ["operations-calendar-day-today", "operations-hub-intro", "work-item-link-erp-doc"],
  },
  {
    id: "find-inventory-record-history",
    title: "Where is History for inventory, repairs, and serials?",
    scenario:
      "You need to know who changed a partner, item, repair order, serial unit, or lot — not the global Activity Logs screen.",
    intro:
      "Per-record History is on every Inventory master list, Stock entries/movements, Price lists, After-Sales repair screens, and Serial Registry / Lot Batches. It uses the same audit trail as Activity Logs, scoped to one record.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open the list (Partners, Items, Repair Orders, Serial Registry, etc.).",
          "Click History on the row — or open the edit modal and use the History button in the header.",
          "Review When / PIC / Activity. Edits after save refresh the timeline automatically.",
          "For serials: use Serial Trace for operational stock events, and History for who registered or adjusted the unit in the system.",
          "Administrators can still open Activity Logs for a tenant-wide search by date, user, or action.",
        ],
      },
      {
        type: "tip",
        text: "You do not need global Activity Log permission to open History on a record you can already view. Change Logs (field-level before/after) still require change-log permission when shown inside modals.",
      },
    ],
    primaryHref: "/app/inventory/items",
    primaryLabel: "Items",
    relatedGuideIds: ["activity-logs-audit", "inventory-master-data", "after-sales-repair", "serial-lot-registry"],
  },
  {
    id: "pos-cannot-open-shift",
    title: "Cannot open a POS shift",
    scenario: "You open POS Terminal and cannot start a session, or checkout fails after scanning.",
    intro:
      "POS needs a stock location, catalog items configured under Manage, and (for serial items) serials already in stock. Permission and module enablement also matter.",
    questions: [
      "cannot open pos shift",
      "pos open session failed",
      "pos checkout blocked",
      "no products on pos grid",
    ],
    blocks: [
      {
        type: "steps",
        items: [
          "Confirm Point of Sale is enabled under Modules & Features.",
          "Ask an admin to open POS → Manage and set a default location plus products/categories.",
          "On Terminal, pick the location that holds sellable stock and enter opening cash.",
          "If checkout fails on serials, receive those units on Goods Receipt first, then scan the serial at POS.",
          "If Manage is missing, request the POS Management permission.",
        ],
      },
      {
        type: "tip",
        text: "Empty grid usually means products are not assigned to a POS category — fix that under Manage → Products / Categories.",
      },
    ],
    primaryHref: "/app/pos",
    primaryLabel: "POS Terminal",
    relatedGuideIds: ["pos-checkout-guide", "pos-manage-settings"],
  },
];
