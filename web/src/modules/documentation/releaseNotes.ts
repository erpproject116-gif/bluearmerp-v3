export type ReleaseNote = {
  date: string;
  title: string;
  bullets: string[];
};

/** User-facing release notes for Help → What’s New. Newest first. */
export const releaseNotes: ReleaseNote[] = [
  {
    date: "2026-10-12",
    title: "Roles, imports, and people records",
    bullets: [
      "Home setup links open the real screens, such as locations, partners, and branding. Branding sections start closed except the company logo.",
      "On a person’s access, you can select or clear every loaded customer or branch at once.",
      "The role screen can search and jump by module. New stores get ready-made jobs such as Sales, Cashier, Stocks, Purchasing, Accountant, HR, and Payroll. Store Admin and Sales Team stay as they are.",
      "Partners and locations can be imported from a spreadsheet on those lists. Custom fields on purchase requests, purchase orders, and goods receipts stay when you reopen the document.",
      "Employee records can store a birthdate, national ID, emergency contact, and photo. National ID is on the form, not the employee list.",
      "Leave notes are optional and can include a file. Absenteeism alerts can store a reason, remarks, and a file. That does not add another pay deduction. Policies, announcements, and events are records only. A discipline penalty changes pay only after you add it as a pay item.",
      "What’s New is in the account menu for everyone who is signed in.",
    ],
  },
  {
    date: "2026-09-13",
    title: "Install Bluearm on phone + clearer laptop chrome",
    bullets: [
      "Install as an app (Android Chrome prompt, or iPhone Share → Add to Home Screen). Floor-first start opens Production; posting still needs network.",
      "On phones and installed PWA: bottom nav for Home, Production, Stock, Chat, and Bell; sell/buy stay reachable from the menu or Search.",
      "13–14\" laptops: sidebar collapses by default between 1024–1279px; below 1024px the menu is a drawer so tables and documents get more width.",
      "Wide document modals scroll on short screens so Save stays reachable — form fields themselves are unchanged.",
    ],
  },
  {
    date: "2026-09-13",
    title: "Recipe production, smarter notifications, and clearer saves",
    bullets: [
      "Production adds a Recipe branch (ingredients → finished goods) with recipe BOM codes, wizard guidance, and jobs beside Assembly and Cutting.",
      "The notification bell targets your role — fewer tenant-wide activity pings; clicks open Sales, PO, PR, RFQ, goods receipt, or production lists with the row highlighted.",
      "Save and approval toasts on key documents are clearer; Help Assistant can open from sticky blocker toasts when something still blocks save.",
      "Header navigation is leaner by role; Production and Buying land on the screens that match your permissions.",
      "Home → Onboarding is a week-by-week self-paced playbook (one step, one action) including Production & recipe — progress still comes from setup and tracked modules.",
    ],
  },
  {
    date: "2026-07-30",
    title: "Purchase Receive, Inv Per Branch, and invites",
    bullets: [
      "Purchase Receive and Sales save with a toast only — no post-save popup.",
      "Dashboard payables card opens AP aging details; receivables still open AR aging.",
      "Terms of payment dropdown removed — use Payment terms or a custom field on Purchase Receive / Sales settings.",
      "Find Stock is renamed Inv Per Branch; serial-tracked rows show a serial count pill next to on-hand qty.",
      "Invite teammates by email when SMTP is configured; they still join by signing in with the same Google email.",
    ],
  },
];
