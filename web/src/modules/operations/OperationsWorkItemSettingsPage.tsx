import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { OPERATIONS_ENTITY } from "../../shared/entityTypes";
import { OperationsLayout } from "./OperationsLayout";

export default function OperationsWorkItemSettingsPage() {
  return (
    <OperationsLayout>
      <EntityFormSettingsPage
        entityType={OPERATIONS_ENTITY.workItem}
        featureLabel="Work item"
        listHref="/app/operations"
      />
    </OperationsLayout>
  );
}
