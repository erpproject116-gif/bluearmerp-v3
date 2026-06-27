import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";

export default function PurchaseRequestSettingsPage() {
  return (
    <PurchaseRequestLayout>
      <EntityFormSettingsPage
        entityType={PURCHASE_REQUEST_ENTITY.purchaseRequest}
        featureLabel="Purchase Request"
        listHref="/app/purchase-request/purchase-requests"
      />
    </PurchaseRequestLayout>
  );
}
