export type ReleaseNote = {
  date: string;
  title: string;
  bullets: string[];
};

/** User-facing release notes for Help → What’s New. Newest first. */
export const releaseNotes: ReleaseNote[] = [
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
