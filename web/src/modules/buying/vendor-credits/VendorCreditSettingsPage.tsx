import { EntityFormSettingsPage } from "../../../shared/EntityFormSettingsPage";
import { PURCHASES_ENTITY } from "../../../shared/entityTypes";

export default function VendorCreditSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType={PURCHASES_ENTITY.vendorCredit}
      featureLabel="Vendor Credits"
      listHref="/app/purchases/vendor-credits"
    />
  );
}
