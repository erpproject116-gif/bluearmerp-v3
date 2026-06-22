import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { FINANCE_ENTITY } from "../../../shared/entityTypes";
import { FinanceLayout } from "../FinanceLayout";

export default function OfficialReceiptSettingsPage() {
  return (
    <FinanceLayout>
      <EntityFormSettingsPage
        entityType={FINANCE_ENTITY.officialReceipt}
        featureLabel="Official Receipt"
        listHref="/app/finance/official-receipts"
      />
    </FinanceLayout>
  );
}
