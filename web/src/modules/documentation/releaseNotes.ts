export type ReleaseNote = {
  date: string;
  title: string;
  bullets: string[];
};

/** User-facing release notes for Help → What’s New. Newest first. */
export const releaseNotes: ReleaseNote[] = [
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
