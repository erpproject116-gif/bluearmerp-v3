import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { HR_ENTITY } from "../../shared/entityTypes";

export default function ApplicantsSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={HR_ENTITY.application}
      featureLabel="Applicants"
      listHref="/app/hr/applicants"
    />
  );
}
