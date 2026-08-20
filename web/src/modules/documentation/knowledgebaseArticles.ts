import type { KbArticle } from "./documentationTypes";
import { knowledgebaseGroups } from "./knowledgebaseGroups";
import { helpScenarioArticles } from "./helpScenarioArticles";
import { moduleKbArticles } from "./moduleKbArticles";

export const knowledgebaseArticles: KbArticle[] = [
  {
    id: "add-another-business",
    title: "How do I add another business?",
    scenario: "You need a second company workspace on BluearmERP.",
    intro:
      "One customer email belongs to one customer business. To run another company, use a different Google email (or have that company's owner start their own trial and invite teammates with their own emails).",
    blocks: [
      {
        type: "heading",
        text: "If someone else should own the new business",
      },
      {
        type: "steps",
        items: [
          "Have the new owner sign up at /signup with an email that is not already invited or linked to another Bluearm company, then start a trial—or ask your BluearmERP platform contact to provision a workspace.",
          "When that workspace is ready, an administrator invites teammates under User Management → Users using emails that are not already used on another company.",
        ],
      },
      {
        type: "heading",
        text: "If you are the administrator of the new business",
      },
      {
        type: "steps",
        items: [
          "Sign up and start a trial (or demo) with a Google email that is not already on another Bluearm company.",
          "Complete the setup wizard for that workspace.",
          "Invite teammates with their own emails — do not reuse an email that already belongs to another customer business.",
        ],
      },
      {
        type: "tip",
        text: "Data never mixes between businesses. Partners, items, stock, and finance are isolated per workspace.",
      },
      {
        type: "tip",
        text: "You cannot join Company A with an email and also create Company B with the same email. Use a different email for your own business.",
      },
    ],
    primaryHref: "/signup",
    primaryLabel: "Create an account",
    relatedGuideIds: ["admin", "getting-started", "join-business-by-invite"],
  },
  {
    id: "switch-between-businesses",
    title: "Why do I see Active business in the sidebar?",
    scenario: "Your login lists more than one company name (legacy or Bluearm ops accounts).",
    intro:
      "Customer accounts follow one email → one business. An Active business dropdown only appears for grandfathered multi-membership logins or certain Bluearm platform/ops accounts. It is not the normal path for new customers.",
    blocks: [
      {
        type: "steps",
        items: [
          "Expand the sidebar if it is collapsed so the footer panel is visible.",
          "If Active business shows a dropdown, choose the company name you intend to work in.",
          "BluearmERP reloads your session for that tenant. Lists, stock, and documents belong to the selected business only.",
        ],
      },
      {
        type: "paragraph",
        text: "Most users see a single company name with no dropdown. To work in another company, use a different Google email for that business (or ask its admin to invite a different email).",
      },
      {
        type: "tip",
        text: "Confirm the company name in the sidebar header after sign-in so you know you joined the right workspace.",
      },
    ],
    relatedGuideIds: ["getting-started", "add-another-business"],
  },
  {
    id: "join-business-by-invite",
    title: "I was invited—how do I join my company's workspace?",
    scenario: "An admin invited your email but you have not entered the ERP yet.",
    intro:
      "Your admin invites your email (email is sent when SMTP is configured). Join by signing in with that same Google email — there is no separate Accept button. That email can only belong to this one customer business.",
    blocks: [
      {
        type: "steps",
        items: [
          "Check your inbox for the invite email (company name, role, and a link to sign in), or ask your admin to resend if SMTP was not set up yet.",
          "Open the sign-in page and continue with Google using the exact email your administrator invited.",
          "On first sign-in, BluearmERP links your login to that company invite and lands you in that workspace.",
          "Confirm the company name in the sidebar (and the Joined toast if shown).",
        ],
      },
      {
        type: "paragraph",
        text: "If sign-in succeeds but you still see “no workspace,” confirm with your admin that they invited the exact email you used and that the invite was not revoked.",
      },
      {
        type: "tip",
        text: "Invited users appear as Invited in User Management until they complete their first Google sign-in. Admins can Resend invite when email is configured. To open your own company later, use a different Google email.",
      },
    ],
    primaryHref: "/signin",
    primaryLabel: "Go to sign in",
    relatedGuideIds: ["admin", "add-another-business"],
  },
  {
    id: "add-branch",
    title: "How do I add another branch to my business?",
    scenario: "You operate from more than one warehouse, store, or site under one company.",
    intro:
      "Branches are locations in Inventory. Each location can hold its own stock balance while sharing the same items and partners.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Stock → Locations (Inventory → Locations in the sidebar).",
          "Click Add or the new-row action to create a location.",
          "Enter a clear name (for example “Makati branch” or “Main warehouse”), set status to Active, and save.",
          "Repeat for every branch. Location codes are assigned automatically.",
        ],
      },
      {
        type: "paragraph",
        text: "New locations start with zero quantity on hand. Receive or transfer stock into them before selling or shipping from that branch.",
      },
      {
        type: "tip",
        text: "Use location type and production process fields only if your manufacturing or WMS workflows need them—most retailers can leave defaults.",
      },
    ],
    primaryHref: "/app/inventory/locations",
    primaryLabel: "Open locations",
    relatedGuideIds: ["inventory"],
  },
  {
    id: "switch-active-branch",
    title: "How do I work in a different branch?",
    scenario: "You have multiple locations and want new documents and stock inquiry defaults to reflect one branch.",
    intro:
      "The Active branch control sits next to the business switcher in the sidebar footer. It sets the default location on new documents. It does not hide other branches’ documents for owners or company admins.",
    blocks: [
      {
        type: "steps",
        items: [
          "Make sure at least two active locations exist under Stock → Locations.",
          "In the sidebar footer, under Active branch, pick the warehouse or store you are working in.",
          "BluearmERP refreshes cached lists on the current page. New quotes, orders, and receipts default to that branch.",
        ],
      },
      {
        type: "paragraph",
        text: "Company-wide roles (owner, store_admin without Apply user data scopes) keep seeing all branch documents. Branch-only staff need Apply user data scopes plus assigned locations. Use Inv Per Branch to inquire qty across branches.",
      },
      {
        type: "tip",
        text: "If you do not see Active branch, you only have one location—add another branch first.",
      },
    ],
    primaryHref: "/app/inventory/locations",
    primaryLabel: "Manage locations",
    relatedGuideIds: ["inventory"],
  },
  {
    id: "transfer-stock-between-branches",
    title: "How do I move inventory from one branch to another?",
    scenario: "Physical stock is moving between your warehouses or stores.",
    intro:
      "Use a stock transfer entry to decrease quantity at the sending branch and increase it at the receiving branch in one posted transaction.",
    blocks: [
      {
        type: "flow",
        items: ["Create transfer draft", "Select from / to locations", "Post entry", "Verify balances"],
      },
      {
        type: "steps",
        items: [
          "Open Stock → Stock Entries.",
          "Click New entry and choose Transfer as the entry type.",
          "Select the source location (from) and destination location (to).",
          "Add the item and quantity being moved, then save the draft.",
          "Click Post on the entry. Posted transfers update on-hand stock at both locations immediately.",
        ],
      },
      {
        type: "paragraph",
        text: "You cannot transfer more than the available quantity at the source location. Check Stock balance or Stock ledger reports if you need to confirm on-hand qty before posting.",
      },
      {
        type: "tip",
        text: "For adjustments without a second location (for example cycle-count corrections), use Stock → Stock Movements → New adjustment instead of a transfer.",
      },
    ],
    primaryHref: "/app/inventory/stock-entries",
    primaryLabel: "Open stock entries",
    relatedGuideIds: ["inventory"],
  },
  {
    id: "receive-stock-at-branch",
    title: "How do I receive stock into a branch?",
    scenario: "Goods arrived at a warehouse and are not tied to a purchase receipt yet.",
    intro: "A stock receipt entry increases on-hand quantity at a single location.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Stock → Stock Entries → New entry.",
          "Choose Receipt as the entry type.",
          "Select the destination location (to) and the item with quantity received.",
          "Save, then Post the entry to update stock.",
          "Open History on the entry row to see who created or posted it.",
        ],
      },
      {
        type: "paragraph",
        text: "For purchases from suppliers, prefer the normal buy-side flow (purchase order → goods receipt) so costs and payables stay aligned. Use a manual receipt only for opening balances or non-PO intake.",
      },
    ],
    primaryHref: "/app/inventory/stock-entries",
    primaryLabel: "Open stock entries",
    relatedGuideIds: ["inventory", "purchase-request", "activity-logs-audit"],
  },
  {
    id: "issue-stock-from-branch",
    title: "How do I issue stock out of a branch?",
    scenario: "You need to remove quantity from a location without sending it to another branch.",
    intro: "A stock issue entry decreases on-hand quantity at one location—for samples, scrapped goods, or internal use.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Stock → Stock Entries → New entry.",
          "Choose Issue as the entry type.",
          "Select the source location (from), item, and quantity.",
          "Save and Post the entry.",
        ],
      },
      {
        type: "tip",
        text: "Customer shipments should normally flow through Sales / Delivery so pricing and invoicing stay in sync. Use Issue only when no sales document applies.",
      },
    ],
    primaryHref: "/app/inventory/stock-entries",
    primaryLabel: "Open stock entries",
    relatedGuideIds: ["inventory", "sales"],
  },
  {
    id: "setup-wizard",
    title: "Workspace setup wizard",
    scenario: "You are setting up a new business before creating quotes or purchases.",
    intro:
      "BluearmERP provisions a standard Philippine SME chart of accounts (general ledger), PHP currency, VAT types, and a Main location automatically. Bank account registers are separate from the GL. The setup wizard requires you to confirm each seeded default, then add partners and products before transactions are allowed.",
    blocks: [
      {
        type: "flow",
        items: [
          "Company (confirm)",
          "Chart of accounts (review)",
          "Currency & tax (confirm)",
          "Process policies (confirm)",
          "Location (confirm)",
          "Partners + products",
        ],
      },
      {
        type: "steps",
        items: [
          "Start a 90-day trial at /welcome — you land on /app/setup.",
          "On each confirm step, open the linked screen if you need to edit, then click Confirm or Looks good.",
          "Add at least one customer or supplier and one product.",
          "When all required steps show complete, create your first quotation or purchase request.",
        ],
      },
      {
        type: "paragraph",
        text: "The API blocks POST requests for quotations, sales orders, sales invoices, purchase documents, and POS until foundation is complete. Inventory and finance setup screens stay available while you configure.",
      },
      {
        type: "tip",
        text: "Skip for now keeps a header reminder. The Dashboard Start here checklist tracks progress until foundation is done.",
      },
    ],
    primaryHref: "/app/setup",
    primaryLabel: "Open setup wizard",
    relatedGuideIds: ["first-week", "process-policies", "inventory"],
  },
  {
    id: "start-90-day-trial",
    title: "How do I start a 90-day free trial?",
    scenario: "You want an empty workspace for your real company data.",
    intro:
      "Trials are self-service: sign up, confirm email, then provision an isolated tenant with seeded accounting defaults.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open /signup and register with email or Google.",
          "On /welcome, click Start 90-day free trial.",
          "BluearmERP creates your workspace (company code like TRIAL-xxx) and opens the setup wizard.",
          "Complete foundation setup, then use Home → Onboarding for module-by-module guidance.",
        ],
      },
      {
        type: "paragraph",
        text: "No credit card is required for the trial period. Your data stays in a tenant-scoped database — never mixed with other customers.",
      },
      {
        type: "tip",
        text: "Prefer sample data first? Use Start a free demo on /welcome instead, then migrate to a trial when ready.",
      },
    ],
    primaryHref: "/welcome",
    primaryLabel: "Start trial",
    relatedGuideIds: ["setup-wizard", "demo-data-training"],
  },
  {
    id: "process-policies-foundation",
    title: "Why must I review process policies during setup?",
    scenario: "Setup wizard asks you to confirm process policies before transactions.",
    intro:
      "Process policies control whether quotations, sales orders, goods receipts, and reservations are mandatory before the next document. Confirming them during setup prevents surprise blocks later.",
    blocks: [
      {
        type: "steps",
        items: [
          "Turn off steps you don’t use under User Management → Modules & Features (or each module’s Setup tab).",
          "Open /app/setup/process-policies or User Management → Process Policies.",
          "Review gates: Sales require SO, Sales require quotation, Purchase require PR, GR before supplier invoice, reservation before release.",
          "Choose legacy combined SO release (stock on pick list) vs split mode (delivery note issues stock).",
          "Click Confirm on the setup step when policies match how you operate.",
        ],
      },
      {
        type: "tip",
        text: "Start permissive (policies off) while learning, then tighten controls before go-live. The Business Dashboard red flags surface gaps when stricter policies are on.",
      },
    ],
    primaryHref: "/app/user-management/process-policies",
    primaryLabel: "Process policies",
    relatedGuideIds: ["process-policies", "setup-wizard"],
  },
  {
    id: "attachment-requirements",
    title: "Why do I need an attachment before confirming?",
    scenario: "Save works but In Progress, Completed, or Confirm is blocked until you upload a file.",
    intro:
      "Your store may require a supporting file (scan of a quote, signed PO, delivery receipt, etc.) before you can confirm a document. This is turned on by default and is controlled under Process Policies.",
    blocks: [
      {
        type: "steps",
        items: [
          "Click Save first — the document must be Unconfirmed with a number before attachments work.",
          "Scroll to the Attachments area on the form and upload at least one file (PDF, image, or scan).",
          "Then change progress to In Progress / Completed, Confirm on a list, or Submit for approval.",
          "If you do not need this rule, an administrator can turn it off per document type under User Management → Process Policies.",
        ],
      },
      {
        type: "tip",
        text: "This applies to quotations, sales orders, sales invoices, purchase orders, and supplier invoices. Files can carry forward when you use Load Slip or convert to the next document.",
      },
    ],
    primaryHref: "/app/user-management/process-policies",
    primaryLabel: "Process policies",
    relatedGuideIds: ["process-policies-foundation", "process-policies"],
  },
  {
    id: "invited-during-setup",
    title: "I was invited but setup is still in progress",
    scenario: "You joined a company workspace that has not finished foundation setup.",
    intro:
      "Only tenant owners and store admins can complete the setup wizard. Invited members can sign in but cannot create selling or buying documents until foundation is done.",
    blocks: [
      {
        type: "steps",
        items: [
          "Sign in with the email your administrator invited.",
          "If you see a banner that setup is in progress, ask your admin to finish /app/setup.",
          "You can still explore read-only areas depending on your role once setup completes.",
        ],
      },
      {
        type: "tip",
        text: "Administrators see an amber setup reminder in the header with a Continue setup link.",
      },
    ],
    primaryHref: "/app/setup",
    primaryLabel: "Setup wizard (admins)",
    relatedGuideIds: ["join-business-by-invite", "setup-wizard"],
  },
  {
    id: "skip-setup-remind-later",
    title: "Can I skip setup and finish later?",
    scenario: "You need to explore the app before entering master data.",
    intro:
      "Owners and store admins can skip the wizard; reminders stay visible until required steps are complete.",
    blocks: [
      {
        type: "steps",
        items: [
          "On any setup step, click Skip for now — remind me in the header.",
          "An amber bar appears at the top with percent complete and Continue setup.",
          "Click Remind me later to snooze the bar for about a week (breadcrumb hint may still show).",
          "Transactions remain blocked until partners, products, and confirm steps are done.",
        ],
      },
    ],
    primaryHref: "/app/setup",
    primaryLabel: "Resume setup",
    relatedGuideIds: ["setup-wizard"],
  },
  {
    id: "serial-barcode-scanning",
    title: "Barcode serial scanning (purchase and sales)",
    scenario: "You receive or sell items that track individual serial numbers.",
    intro:
      "On goods receipt, scan the item code to select a line, then scan each serial. On sales, scan serial numbers directly — quantity must equal the number of serials.",
    blocks: [
      {
        type: "heading",
        text: "Receiving (replenish stock)",
      },
      {
        type: "steps",
        items: [
          "Prefer Purchase Receive: enter serials on the lines and confirm — stock and serials post together.",
          "Legacy path: create a draft receive from a PO, then use Serial Receive or the Receive history scan panel.",
          "Scan item code, then scan each serial until the line is complete.",
          "On confirm/post, serials move to in_stock.",
        ],
      },
      {
        type: "heading",
        text: "Selling (diminish stock)",
      },
      {
        type: "steps",
        items: [
          "On a sales invoice or SO release line with Track serial, use the serial scan box.",
          "Each accepted scan adds one unit; you cannot save without matching serial count.",
          "POS and SO-to-sales flows follow the same server rules.",
        ],
      },
    ],
    primaryHref: "/app/purchases/purchase-receive/new",
    primaryLabel: "Open Purchase Receive",
    relatedGuideIds: ["inventory", "sales", "activity-logs-audit", "serial-lot-registry"],
  },
  ...moduleKbArticles,
  ...helpScenarioArticles,
];

export function getKbArticle(id: string): KbArticle | undefined {
  return knowledgebaseArticles.find((a) => a.id === id);
}

export function orderedKbArticleIds(): string[] {
  return knowledgebaseGroups.flatMap((g) => g.articleIds);
}
