import { A } from "@solidjs/router";

const links = [
  {
    title: "Taxpayer profile",
    description: "RDO, tax regime, line of business, and COR reference for BIR filings.",
    href: "/app/finance/statutory/taxpayer-profile",
  },
  {
    title: "2307 certificates",
    description: "Period-based creditable withholding certificates aggregated from payment vouchers and supplier invoices.",
    href: "/app/finance/statutory/2307-certificates",
  },
  {
    title: "1601-EQ workpaper",
    description: "Expanded withholding tax summary by ATC and payee TIN for accountant review.",
    href: "/app/finance/statutory/1601-eq",
  },
  {
    title: "Compensation WHT (1601-C & alphalist)",
    description: "Payroll withholding spreadsheet packs and employee alphalist by tax year. For accountant review — not certified eFPS.",
    href: "/app/finance/statutory/compensation-wht",
  },
  {
    title: "Books of accounts",
    description: "Sales, purchase, cash, and general journals plus general ledger by fiscal period (CSV / print HTML).",
    href: "/app/finance/statutory/books",
  },
  {
    title: "Year-end close",
    description: "Post closing entry to retained earnings and optionally lock fiscal periods.",
    href: "/app/finance/statutory/year-end-close",
  },
  {
    title: "Registration attachments",
    description: "COR, CAS, and ATP document links on the taxpayer profile vault.",
    href: "/app/finance/statutory/attachments",
  },
  {
    title: "VAT sales register",
    description: "Posted sales invoices and credit notes with vatable, exempt, zero-rated, and output VAT columns.",
    href: "/app/finance/statutory/vat/sales",
  },
  {
    title: "VAT purchases register",
    description: "Posted supplier invoices and vendor credits with input VAT and partner TIN.",
    href: "/app/finance/statutory/vat/purchases",
  },
  {
    title: "2550M / 2550Q workpaper",
    description: "Monthly or quarterly VAT return prep with CPA adjustment fields and GL reconciliation.",
    href: "/app/finance/statutory/2550",
  },
  {
    title: "Percentage tax (stub)",
    description: "Placeholder for non-VAT percentage tax filing prep.",
    href: "/app/finance/statutory/percentage-tax",
  },
  {
    title: "Document series",
    description: "BIR permit / CAS ranges for official receipts and sales invoices.",
    href: "/app/finance/statutory/document-series",
  },
  {
    title: "Withholding tax codes",
    description: "Maintain ATC-style codes and rates applied on vouchers and supplier invoices.",
    href: "/app/finance/acct-ii/withholding-codes",
  },
  {
    title: "Branding & TIN",
    description: "Company TIN and address used as payor on printed 2307 certificates.",
    href: "/app/settings/branding",
  },
];

export default function StatutoryHubPage() {
  return (
    <div class="mx-auto max-w-3xl space-y-6 p-4">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">BIR statutory hub</h2>
        <p class="mt-1 text-sm text-text-secondary">
          PH withholding and VAT compliance workpapers, registers, and certificate printing.{" "}
          <strong class="font-medium text-amber-800">For accountant review — not a BIR e-filing submission.</strong>
        </p>
      </section>
      <ul class="space-y-3">
        {links.map((link) => (
          <li>
            <A
              href={link.href}
              class="block rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <span class="font-medium text-brand-700">{link.title}</span>
              <p class="mt-1 text-sm text-text-secondary">{link.description}</p>
            </A>
          </li>
        ))}
      </ul>
    </div>
  );
}
