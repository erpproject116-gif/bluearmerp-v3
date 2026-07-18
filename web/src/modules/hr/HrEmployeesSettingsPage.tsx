import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { HR_ENTITY } from "../../shared/entityTypes";

export default function HrEmployeesSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={HR_ENTITY.employee}
      featureLabel="Employees"
      listHref="/app/hr/employees"
    />
  );
}
