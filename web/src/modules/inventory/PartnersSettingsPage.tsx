import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { INVENTORY_ENTITY } from "../../shared/entityTypes";

export default function PartnersSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={INVENTORY_ENTITY.partners}
      featureLabel="Customers & vendors"
      listHref="/app/inventory/partners"
    />
  );
}
