export type StageColor = { bg: string; text: string };

export type BrandingColors = {
  primary: string;
  primary_hover: string;
  secondary: string;
  accent: string;
  heading: string;
  label: string;
  text: string;
  text_secondary: string;
  background: string;
  surface: string;
  stroke: string;
};

export type BrandingReceipt = {
  company_name: string;
  address: string;
  phone: string;
  email: string;
  tax_id: string;
  header_text: string;
  footer_text: string;
  logo_asset_id: number | null;
};

export type BrandingSettings = {
  colors: BrandingColors;
  stages: Record<string, StageColor>;
  labels: Record<string, string>;
  placeholders: Record<string, string>;
  receipt: BrandingReceipt;
};

export type BrandingPayload = {
  settings: BrandingSettings;
  can_manage: boolean;
  logo_url?: string;
  /** True when logo_asset_id is set but the file is missing on disk — re-upload required. */
  logo_missing?: boolean;
};
