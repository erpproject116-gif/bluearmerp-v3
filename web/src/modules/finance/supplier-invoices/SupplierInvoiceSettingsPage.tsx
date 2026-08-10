import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { PURCHASES_ENTITY } from "../../../shared/entityTypes";

export default function SupplierInvoiceSettingsPage() {
  return (
    <div class="space-y-3">
      <p class="rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm text-text-secondary">
        Use <span class="font-medium text-text-primary">Payment terms</span> or add a custom field for your own terms list.
      </p>
      <EntityFormSettingsPage
        entityType={PURCHASES_ENTITY.purchases}
        featureLabel="Purchases"
        listHref="/app/purchases/purchase-receive"
      />
    </div>
  );
}
