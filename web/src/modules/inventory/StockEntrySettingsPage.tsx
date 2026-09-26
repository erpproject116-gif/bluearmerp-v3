import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";

export default function StockEntrySettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType="inv_stock_entry"
      featureLabel="Stocks Transfer"
      listHref="/app/inventory/stock-entries"
    />
  );
}
