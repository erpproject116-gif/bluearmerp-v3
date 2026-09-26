import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";

export default function StockAdjustmentSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType="inv_stock_adjustment"
      featureLabel="Stock Adjustments"
      listHref="/app/inventory/stock-adjustments"
    />
  );
}
