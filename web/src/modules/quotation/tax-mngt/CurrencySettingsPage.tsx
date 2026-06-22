import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { QUOTATION_ENTITY } from "../../../shared/entityTypes";
import { QuotationLayout } from "../QuotationLayout";

export default function CurrencySettingsPage() {
  return (
    <QuotationLayout>
      <EntityFormSettingsPage
        entityType={QUOTATION_ENTITY.currency}
        featureLabel="Currency"
        listHref="/app/quotation/tax-mngt/currencies"
      />
    </QuotationLayout>
  );
}
