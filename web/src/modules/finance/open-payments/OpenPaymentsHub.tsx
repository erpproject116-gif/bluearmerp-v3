import { A } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { FinanceLayout } from "../FinanceLayout";

export type OpenPaymentNavItem = { label: string; href: string; exact?: boolean };

type Props = {
  side: "ar" | "ap";
  title: string;
  nav: OpenPaymentNavItem[];
  children: JSX.Element;
};

export function OpenPaymentsHub(props: Props) {
  const isActive = (item: OpenPaymentNavItem) => {
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    if (item.exact) return path === item.href;
    return path === item.href || path.startsWith(item.href + "/");
  };

  return (
    <FinanceLayout>
      <div class="flex min-h-[70vh] gap-0">
        <aside class="w-56 shrink-0 border-r border-stroke bg-slate-50/80 p-3">
          <p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {props.side === "ar" ? "Receivable Management" : "Payable Management"}
          </p>
          <nav class="flex flex-col gap-0.5">
            <For each={props.nav}>
              {(item) => (
                <A
                  href={item.href}
                  class={`rounded-md px-2 py-1.5 text-sm ${
                    isActive(item)
                      ? "bg-brand-100 font-medium text-brand-800"
                      : "text-text-primary hover:bg-white"
                  }`}
                >
                  {item.label}
                </A>
              )}
            </For>
          </nav>
        </aside>
        <div class="min-w-0 flex-1 p-4 md:p-6">
          <h1 class="mb-4 text-xl font-semibold text-text-primary">{props.title}</h1>
          {props.children}
        </div>
      </div>
    </FinanceLayout>
  );
}

export const AR_PAYMENT_NAV: OpenPaymentNavItem[] = [
  { label: "New Receivable Payment", href: "/app/finance/receivables", exact: true },
  { label: "Official Receipts", href: "/app/finance/official-receipts" },
  { label: "OR Status", href: "/app/finance/reports/official-receipt-status" },
  { label: "Receivable Status", href: "/app/selling/reports/receivable-status" },
  { label: "AR Aging Details", href: "/app/finance/reports/ar-aging-details" },
  { label: "Customer AR Book", href: "/app/finance/reports/customer-vendor-book-ar" },
  { label: "Collections", href: "/app/finance/collections" },
];

export const AP_PAYMENT_NAV: OpenPaymentNavItem[] = [
  { label: "New Payable Payment", href: "/app/finance/payables", exact: true },
  { label: "Payment Vouchers", href: "/app/finance/payment-vouchers" },
  { label: "Supplier Payment Status", href: "/app/finance/reports/supplier-payment-status" },
  { label: "Payable Status", href: "/app/buying/reports/payable-status" },
  { label: "AP Aging Details", href: "/app/finance/reports/ap-aging-details" },
  { label: "Vendor AP Book", href: "/app/finance/reports/customer-vendor-book-ap" },
];
