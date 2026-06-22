import { AfterSalesLayout } from "./AfterSalesLayout";

export default function RegisterRepairPlaceholder() {
  return (
    <AfterSalesLayout>
      <div class="rounded-xl border border-dashed border-stroke bg-slate-50 p-10 text-center">
        <h2 class="text-lg font-semibold text-text-primary">Register Repair</h2>
        <p class="mt-2 text-sm text-text-secondary">
          This feature is planned for the next epic. It will include repair registration, consumption tracking, and
          warranty repair logs linked to repair orders.
        </p>
      </div>
    </AfterSalesLayout>
  );
}
