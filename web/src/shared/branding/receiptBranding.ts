import type { BrandingReceipt, BrandingSettings } from "./types";

export function formatReceiptContact(receipt: BrandingReceipt): string[] {
  const lines: string[] = [];
  if (receipt.address?.trim()) lines.push(receipt.address.trim());
  const contact: string[] = [];
  if (receipt.phone?.trim()) contact.push(receipt.phone.trim());
  if (receipt.email?.trim()) contact.push(receipt.email.trim());
  if (contact.length) lines.push(contact.join(" · "));
  if (receipt.tax_id?.trim()) lines.push(`Tax ID: ${receipt.tax_id.trim()}`);
  return lines;
}

export function resolvePrintCompanyName(
  templateName: string | undefined,
  branding: BrandingSettings,
  tenantName?: string,
): string {
  if (templateName?.trim()) return templateName.trim();
  if (branding.receipt.company_name?.trim()) return branding.receipt.company_name.trim();
  return tenantName ?? "Company";
}

export function resolvePrintHeaderText(templateHeader: string | undefined, branding: BrandingSettings): string {
  if (templateHeader?.trim()) return templateHeader.trim();
  if (branding.receipt.header_text?.trim()) return branding.receipt.header_text.trim();
  return formatReceiptContact(branding.receipt).join("\n");
}

export function resolvePrintFooterText(templateFooter: string | undefined, branding: BrandingSettings): string {
  if (templateFooter?.trim()) return templateFooter.trim();
  return branding.receipt.footer_text?.trim() ?? "";
}

export function resolveLogoAssetId(templateLogoId: number | null | undefined, branding: BrandingSettings): number | null {
  if (templateLogoId) return templateLogoId;
  return branding.receipt.logo_asset_id ?? null;
}
