import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { SALES_ENTITY } from "../../../shared/entityTypes";
import { SalesLayout } from "../SalesLayout";

export default function SalesSettingsPage() {
  return (
    <SalesLayout>
      <EntityFormSettingsPage
        entityType={SALES_ENTITY.sales}
        featureLabel="Sales"
        listHref="/app/sales/sales"
      />
    </SalesLayout>
  );
}
