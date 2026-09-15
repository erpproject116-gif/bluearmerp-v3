import type { BrandingSettings } from "./types";

/** Static fallback when the tenant has not uploaded a branding logo yet. */
export const DEFAULT_BRAND_LOGO_URL = "/bluearmerp-logo.png";

export const DEFAULT_BRANDING: BrandingSettings = {
  colors: {
    primary: "#3c50e0",
    primary_hover: "#3641c9",
    secondary: "#64748b",
    accent: "#0ea5e9",
    heading: "#1c2434",
    label: "#475569",
    text: "#1c2434",
    text_secondary: "#64748b",
    background: "#f1f5f9",
    surface: "#ffffff",
    stroke: "#e2e8f0",
  },
  stages: {
    unconfirmed: { bg: "#fef3c7", text: "#92400e" },
    in_progress: { bg: "#dbeafe", text: "#1e40af" },
    completed: { bg: "#dcfce7", text: "#166534" },
    received: { bg: "#e0e7ff", text: "#3730a3" },
    finished: { bg: "#dcfce7", text: "#166534" },
    partial: { bg: "#ffedd5", text: "#9a3412" },
  },
  labels: {},
  placeholders: {},
  receipt: {
    company_name: "",
    address: "",
    phone: "",
    email: "",
    tax_id: "",
    header_text: "",
    footer_text: "",
    logo_asset_id: null,
  },
};

export const LABEL_PRESETS: { key: string; label: string; fallback: string }[] = [
  { key: "app.tagline", label: "App tagline (sidebar)", fallback: "ERP v3" },
  { key: "app.modules_heading", label: "Sidebar modules heading", fallback: "Modules" },
  { key: "app.sign_out", label: "Sign out button", fallback: "Sign out" },
  { key: "app.collapse_sidebar", label: "Collapse sidebar", fallback: "Collapse" },
  { key: "app.branding_link", label: "Branding settings link", fallback: "Branding" },
  { key: "app.billing_link", label: "Billing settings link", fallback: "Billing & subscription" },
  { key: "progress.unconfirmed", label: "Stage: Unconfirmed", fallback: "Unconfirmed" },
  { key: "progress.completed", label: "Stage: Completed", fallback: "Completed" },
  { key: "progress.in_progress", label: "Stage: In progress", fallback: "In progress" },
  { key: "progress.received", label: "Stage: Received", fallback: "Received" },
  { key: "progress.finished", label: "Stage: Finished", fallback: "Finished" },
  { key: "progress.partial", label: "Stage: Partial", fallback: "Partial" },
];

export const PLACEHOLDER_PRESETS: { key: string; label: string; fallback: string }[] = [
  { key: "search.customer", label: "Search customer", fallback: "Search customer…" },
  { key: "search.partner", label: "Search partner", fallback: "Search partner…" },
  { key: "search.item", label: "Search item", fallback: "Search item…" },
  { key: "form.remarks", label: "Remarks field", fallback: "Remarks" },
];

export const STAGE_KEYS = [
  "unconfirmed",
  "in_progress",
  "completed",
  "received",
  "finished",
  "partial",
] as const;
