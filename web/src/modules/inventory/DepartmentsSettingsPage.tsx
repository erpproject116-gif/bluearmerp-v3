import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { INVENTORY_ENTITY } from "../../shared/entityTypes";

export default function DepartmentsSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={INVENTORY_ENTITY.departments}
      featureLabel="Departments"
      listHref="/app/inventory/departments"
    />
  );
}
