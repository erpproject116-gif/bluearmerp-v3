import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { SALES_ENTITY } from "../../../shared/entityTypes";
import { SalesLayout } from "../SalesLayout";

export default function SalesSettingsPage() {
  return (
    <SalesLayout>
      <div class="space-y-3">
        <p class="rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm text-text-secondary">
          Use <span class="font-medium text-text-primary">Payment terms</span> or add a custom field for your own terms list.
        </p>
        <EntityFormSettingsPage
          entityType={SALES_ENTITY.sales}
          featureLabel="Sales"
          listHref="/app/sales/sales"
        />
      </div>
    </SalesLayout>
  );
}
