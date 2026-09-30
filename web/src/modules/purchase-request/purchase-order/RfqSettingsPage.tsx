import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";

export default function RfqSettingsPage() {
  return (
    <PurchaseRequestLayout>
      <EntityFormSettingsPage
        entityType={PURCHASE_REQUEST_ENTITY.rfq}
        featureLabel="RFQ"
        listHref="/app/purchase-order/rfq"
      />
    </PurchaseRequestLayout>
  );
}
