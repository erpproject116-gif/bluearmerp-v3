import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { QUOTATION_ENTITY } from "../../../shared/entityTypes";
import { QuotationLayout } from "../QuotationLayout";

export default function TaxTypeSettingsPage() {
  return (
    <QuotationLayout>
      <EntityFormSettingsPage
        entityType={QUOTATION_ENTITY.taxType}
        featureLabel="Tax Type"
        listHref="/app/quotation/tax-mngt/tax-types"
      />
    </QuotationLayout>
  );
}
