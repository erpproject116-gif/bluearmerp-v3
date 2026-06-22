import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { INVENTORY_ENTITY } from "../../shared/entityTypes";

export default function ItemsSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={INVENTORY_ENTITY.items}
      featureLabel="Items"
      listHref="/app/inventory/items"
    />
  );
}
