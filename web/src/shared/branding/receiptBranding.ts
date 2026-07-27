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
  return tenantName?.trim() || "Company";
}

/**
 * Remove company-name duplicates from header meta so the letterhead h1 is not
 * repeated (common when header_text or address starts with the company name).
 */
export function normalizePrintHeaderLines(companyName: string, headerText: string): string {
  const company = companyName.trim();
  const companyLower = company.toLowerCase();
  const lines = headerText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (let line of lines) {
    if (companyLower && line.toLowerCase() === companyLower) continue;
    if (companyLower && line.toLowerCase().startsWith(companyLower)) {
      const rest = line.slice(company.length).replace(/^[\s,·\-|:]+/u, "").trim();
      if (!rest) continue;
      line = rest;
    }
    if (out.some((x) => x.toLowerCase() === line.toLowerCase())) continue;
    out.push(line);
  }
  return out.join("\n");
}

export function resolvePrintHeaderText(
  templateHeader: string | undefined,
  branding: BrandingSettings,
  companyName?: string,
): string {
  const parts: string[] = [];
  if (templateHeader?.trim()) {
    parts.push(templateHeader.trim());
  } else if (branding.receipt.header_text?.trim()) {
    parts.push(branding.receipt.header_text.trim());
  }
  const contact = formatReceiptContact(branding.receipt);
  for (const line of contact) {
    if (!parts.includes(line)) parts.push(line);
  }
  const joined = parts.join("\n");
  const company =
    companyName?.trim() ||
    branding.receipt.company_name?.trim() ||
    "";
  return normalizePrintHeaderLines(company, joined);
}

export function resolvePrintFooterText(templateFooter: string | undefined, branding: BrandingSettings): string {
  if (templateFooter?.trim()) return templateFooter.trim();
  return branding.receipt.footer_text?.trim() ?? "";
}

export function resolveLogoAssetId(templateLogoId: number | null | undefined, branding: BrandingSettings): number | null {
  if (templateLogoId) return templateLogoId;
  return branding.receipt.logo_asset_id ?? null;
}
