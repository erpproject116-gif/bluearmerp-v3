import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";

export default function PurchaseOrderSettingsPage() {
  return (
    <PurchaseRequestLayout>
      <EntityFormSettingsPage
        entityType={PURCHASE_REQUEST_ENTITY.purchaseOrder}
        featureLabel="Purchase Order"
        listHref="/app/purchase-order/purchase-orders"
      />
    </PurchaseRequestLayout>
  );
}
