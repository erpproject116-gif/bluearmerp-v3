import type { KbArticle } from "./documentationTypes";
import { knowledgebaseGroups } from "./knowledgebaseGroups";

export const knowledgebaseArticles: KbArticle[] = [
  {
    id: "add-another-business",
    title: "How do I add another business to the same account?",
    scenario: "You run more than one company and want one login for all of them.",
    intro:
      "Each business in BluearmERP is a separate workspace (tenant). You do not create a second business from inside an existing one—you get access when you are invited, when a platform admin provisions one for you, or when you start a new trial or demo with the same email.",
    blocks: [
      {
        type: "heading",
        text: "If someone else should own the new business",
      },
      {
        type: "steps",
        items: [
          "Ask your BluearmERP platform contact to provision a workspace for that company, or have the new owner sign up at /signup and start a 90-day trial.",
          "When the new workspace is ready, an administrator in that business invites your email under User Management → Users.",
          "Sign out and sign back in (or refresh the page). Your account now lists both businesses.",
        ],
      },
      {
        type: "heading",
        text: "If you are the administrator of the new business",
      },
      {
        type: "steps",
        items: [
          "Complete signup or trial provisioning for the new company using your email.",
          "BluearmERP links the same Google or email login to every workspace you are invited to—no second password.",
          "Use the Active business control at the bottom of the sidebar to switch between companies.",
        ],
      },
      {
        type: "tip",
        text: "Data never mixes between businesses. Partners, items, stock, and finance are isolated per workspace.",
      },
    ],
    primaryHref: "/app/user-management/users",
    primaryLabel: "Open user management",
    relatedGuideIds: ["admin", "getting-started"],
  },
  {
    id: "switch-between-businesses",
    title: "How do I switch between businesses?",
    scenario: "Your login has access to multiple company workspaces.",
    intro:
      "When your email is linked to more than one business, a selector appears in the sidebar footer so you can change the active workspace.",
    blocks: [
      {
        type: "steps",
        items: [
          "Expand the sidebar if it is collapsed so the footer panel is visible.",
          "Under Active business, choose the company name from the dropdown.",
          "BluearmERP reloads your session for that tenant and returns you to the app home. Lists, stock, and documents now belong to the selected business only.",
        ],
      },
      {
        type: "paragraph",
        text: "If you only see one business name (no dropdown), your account has a single workspace. Ask an administrator of the other company to invite your email, or contact your platform admin to provision access.",
      },
      {
        type: "tip",
        text: "Bookmark /app after switching—browser tabs do not share active business state across different logins.",
      },
    ],
    relatedGuideIds: ["getting-started"],
  },
  {
    id: "join-business-by-invite",
    title: "I was invited—how do I join my company's workspace?",
    scenario: "An admin invited your email but you have not entered the ERP yet.",
    intro:
      "Invites are tied to your email address. Use the same email on sign-in that your administrator invited.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open the sign-in page and continue with Google, or sign in with the email and password you registered.",
          "On first sign-in, BluearmERP automatically links your login to every pending invite for that email.",
          "You land inside the company workspace. If you also have a personal trial, use Active business in the sidebar footer to pick the right company.",
        ],
      },
      {
        type: "paragraph",
        text: "If sign-in succeeds but you still see “no workspace,” confirm with your admin that they invited the exact email you used and that the invite was not revoked.",
      },
      {
        type: "tip",
        text: "Invited users appear as Invited in User Management until they complete their first sign-in.",
      },
    ],
    primaryHref: "/signin",
    primaryLabel: "Go to sign in",
    relatedGuideIds: ["admin"],
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
    scenario: "You have multiple locations and want lists and entry screens to reflect one branch.",
    intro:
      "The active branch filter sits next to the business switcher in the sidebar footer. It scopes stock-aware screens to the location you select.",
    blocks: [
      {
        type: "steps",
        items: [
          "Make sure at least two active locations exist under Stock → Locations.",
          "In the sidebar footer, under Active branch, pick the warehouse or store you are working in.",
          "BluearmERP refreshes cached lists on the current page. Stock balances, movements, and location defaults follow the branch you chose.",
        ],
      },
      {
        type: "paragraph",
        text: "Documents such as sales orders and quotations still let you pick a location per transaction. The active branch mainly drives defaults and stock reports.",
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
        ],
      },
      {
        type: "paragraph",
        text: "For purchases from suppliers, prefer the normal buy-side flow (purchase order → goods receipt) so costs and payables stay aligned. Use a manual receipt only for opening balances or non-PO intake.",
      },
    ],
    primaryHref: "/app/inventory/stock-entries",
    primaryLabel: "Open stock entries",
    relatedGuideIds: ["inventory", "purchase-request"],
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
];

export function getKbArticle(id: string): KbArticle | undefined {
  return knowledgebaseArticles.find((a) => a.id === id);
}

export function orderedKbArticleIds(): string[] {
  return knowledgebaseGroups.flatMap((g) => g.articleIds);
}
