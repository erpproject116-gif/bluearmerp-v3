import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";

export default function GoodsReceiptSettingsPage() {
  return (
    <PurchaseRequestLayout>
      <EntityFormSettingsPage
        entityType={PURCHASE_REQUEST_ENTITY.goodsReceipt}
        featureLabel="Purchase Receive"
        listHref="/app/purchase-order/goods-receipt"
      />
    </PurchaseRequestLayout>
  );
}
