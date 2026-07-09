export type ReviewPurchasesNavLink = {
  label: string;
  href: string;
  permissionCode?: string;
};

/** Virtual marker for sub-branch detection (not a real URL path). */
export const REVIEW_PURCHASES_SUB_BRANCH = "__finance_ap_review__";

/** Finance URLs for AP review (payment vouchers & vendor reports). */
export const REVIEW_PURCHASES_PREFIXES = [
  "/app/finance/payment-vouchers",
  "/app/finance/reports/supplier-payment-status",
  "/app/finance/reports/ap-by-vendor",
  "/app/finance/reports/ap-aging",
] as const;

export const reviewPurchasesNavLinks: ReviewPurchasesNavLink[] = [
  { label: "Payment Vouchers", href: "/app/finance/payment-vouchers", permissionCode: "finance.payment_vouchers" },
  { label: "New Payment", href: "/app/finance/payment-vouchers/new", permissionCode: "finance.payment_vouchers_new" },
  { label: "Payment Status", href: "/app/finance/reports/supplier-payment-status", permissionCode: "finance.reports_supplier_payment_status" },
  { label: "A/P by Vendor", href: "/app/finance/reports/ap-by-vendor", permissionCode: "finance.reports_ap_by_vendor" },
  { label: "A/P Aging", href: "/app/finance/reports/ap-aging", permissionCode: "finance.reports_ap_by_vendor" },
];

export function isReviewPurchasesPath(pathname: string): boolean {
  return REVIEW_PURCHASES_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isReviewPurchasesNavLinkActive(pathname: string, link: ReviewPurchasesNavLink): boolean {
  if (link.href === "/app/finance/payment-vouchers") {
    return (
      pathname === link.href ||
      (pathname.startsWith(`${link.href}/`) && !pathname.startsWith("/app/finance/payment-vouchers/new"))
    );
  }
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function reviewPurchasesHeaderTitle(pathname: string): string {
  if (pathname.includes("/new")) {
    if (pathname.includes("payment-vouchers")) return "New payment voucher";
    return "New payment";
  }
  if (pathname.includes("payment-vouchers")) return "Payment vouchers";
  if (pathname.includes("reports/")) {
    const link = reviewPurchasesNavLinks.find((l) => isReviewPurchasesNavLinkActive(pathname, l));
    return link?.label ?? "AP Review report";
  }
  return "AP Review";
}
