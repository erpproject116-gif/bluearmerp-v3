import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { QUOTATION_ENTITY } from "../../../shared/entityTypes";
import { QuotationLayout } from "../QuotationLayout";

export default function QuotationSettingsPage() {
  return (
    <QuotationLayout>
      <EntityFormSettingsPage
        entityType={QUOTATION_ENTITY.quotation}
        featureLabel="Quotation"
        listHref="/app/quotation/quotations"
      />
    </QuotationLayout>
  );
}
