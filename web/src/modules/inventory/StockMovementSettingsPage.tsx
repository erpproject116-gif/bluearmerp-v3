import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";

export default function StockMovementSettingsPage() {
  return (
    <EntityFormSettingsPage
      entityType="inv_stock_movement"
      featureLabel="Stock Movements"
      listHref="/app/inventory/stock-movements"
      listColumnsOnly
    />
  );
}
