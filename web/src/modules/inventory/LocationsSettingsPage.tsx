import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { INVENTORY_ENTITY } from "../../shared/entityTypes";

export default function LocationsSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={INVENTORY_ENTITY.locations}
      featureLabel="Locations"
      listHref="/app/inventory/locations"
    />
  );
}
