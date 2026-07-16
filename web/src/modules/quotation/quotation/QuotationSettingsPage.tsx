import { A } from "@solidjs/router";
import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { QUOTATION_ENTITY } from "../../../shared/entityTypes";
import { QuotationLayout } from "../QuotationLayout";

export default function QuotationSettingsPage() {
  return (
    <QuotationLayout>
      <div class="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p class="font-medium text-slate-900">Attachment required / optional</p>
        <p class="mt-1">
          Attachment rules are not form fields. Turn quotation attachments on or off under{" "}
          <A href="/app/user-management/process-policies" class="font-medium text-brand-700 underline">
            User Management → Process policies
          </A>{" "}
          (“Require attachment on quotation confirm”).
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
