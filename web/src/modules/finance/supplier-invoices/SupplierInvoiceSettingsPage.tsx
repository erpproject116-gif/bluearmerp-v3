import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";

export default function SupplierInvoiceSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={PURCHASE_REQUEST_ENTITY.supplierInvoice}
      featureLabel="Supplier Invoice"
      listHref="/app/finance/supplier-invoices"
    />
  );
}
