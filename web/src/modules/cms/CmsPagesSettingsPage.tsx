import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { CMS_ENTITY } from "../../shared/entityTypes";

export default function CmsPagesSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={CMS_ENTITY.page}
      featureLabel="Pages"
      listHref="/app/cms"
    />
  );
}
