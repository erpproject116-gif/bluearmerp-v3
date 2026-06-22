import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { SALES_ORDER_ENTITY } from "../../../shared/entityTypes";
import { SalesOrderLayout } from "../SalesOrderLayout";

export default function SalesOrderSettingsPage() {
  return (
    <SalesOrderLayout>
      <EntityFormSettingsPage
        entityType={SALES_ORDER_ENTITY.salesOrder}
        featureLabel="Sales Order"
        listHref="/app/sales-order/sales-orders"
      />
    </SalesOrderLayout>
  );
}
