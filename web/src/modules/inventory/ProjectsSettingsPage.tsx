import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { INVENTORY_ENTITY } from "../../shared/entityTypes";

export default function ProjectsSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={INVENTORY_ENTITY.projects}
      featureLabel="Projects"
      listHref="/app/inventory/projects"
    />
  );
}
