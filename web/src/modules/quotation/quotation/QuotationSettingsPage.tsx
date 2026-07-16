import { A } from "@solidjs/router";
import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { QUOTATION_ENTITY } from "../../../shared/entityTypes";
import { QuotationLayout } from "../QuotationLayout";

export default function QuotationSettingsPage() {
  return (
    <QuotationLayout>
      <div class="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p class="font-medium text-slate-900">Attachments are optional</p>
        <p class="mt-1">
          By default, quotation confirm does <strong>not</strong> require a file. You can still upload attachments anytime.
          Only turn on “Require attachment on quotation confirm” under{" "}
          <A href="/app/user-management/process-policies" class="font-medium text-brand-700 underline">
            User Management → Process policies
          </A>{" "}
          if your process must block confirm without a file.
        </p>
      </div>
      <EntityFormSettingsPage
        entityType={QUOTATION_ENTITY.quotation}
        featureLabel="Quotation"
        listHref="/app/quotation/quotations"
      />
    </QuotationLayout>
  );
}
