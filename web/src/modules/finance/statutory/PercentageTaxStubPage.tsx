import { A } from "@solidjs/router";

export default function PercentageTaxStubPage() {
  return (
    <div class="mx-auto max-w-xl space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>Percentage tax</span>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Percentage tax workpaper (stub)</h2>
        <p class="mt-2 text-sm text-text-secondary">
          For non-VAT and percentage-tax registrants. Automated BIR Form 2551Q prep is planned in a later statutory phase.
        </p>
        <p class="mt-3 text-sm font-medium text-amber-800">
          For accountant review — not a BIR e-filing submission.
        </p>
        <p class="mt-4 text-sm text-text-secondary">
          Configure your tax regime under{" "}
          <A href="/app/finance/statutory/taxpayer-profile" class="text-brand-600 hover:underline">
            Taxpayer profile
          </A>
          . VAT-registered tenants should use the{" "}
          <A href="/app/finance/statutory/2550" class="text-brand-600 hover:underline">
            2550M / 2550Q workpaper
          </A>{" "}
          instead.
        </p>
      </section>
    </div>
  );
}
