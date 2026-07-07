import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { PURCHASES_ENTITY } from "../../../shared/entityTypes";

export default function SupplierInvoiceSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={PURCHASES_ENTITY.purchases}
      featureLabel="Purchases"
      listHref="/app/purchases/purchases"
    />
  );
}
