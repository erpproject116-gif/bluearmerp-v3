import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { INVENTORY_ENTITY } from "../../../shared/entityTypes";
import { AfterSalesLayout } from "./AfterSalesLayout";

export default function RepairOrderSettingsPage() {
  return (
    <AfterSalesLayout>
      <EntityFormSettingsPage
        entityType={INVENTORY_ENTITY.repairOrder}
        featureLabel="Repair Order"
        listHref="/app/inventory/after-sales/repair-orders"
      />
    </AfterSalesLayout>
  );
}
