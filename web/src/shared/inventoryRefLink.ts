/** Deep-link or list href for inventory document refs on serial trace / stock ledger. */
export function inventoryRefLink(
  refType?: string | null,
  refId?: number | null,
): { label: string; href?: string } {
  if (!refType) return { label: "—" };
  const suffix = refId ? ` #${refId}` : "";
  const typeLabels: Record<string, string> = {
    goods_receipt: "Purchase Receive",
    sales: "Sales",
    sa_sales_line: "Sales",
    sales_order: "Sales Order",
    shipping_order: "Shipping Order",
    purchase_order: "Purchase Order",
    quotation: "Quotation",
    serial_adjustment: "Serial Adjustment",
    lot_adjustment: "Lot Adjustment",
    stock_entry: "Stock Entry",
  };
  const typeHrefs: Record<string, string> = {
    goods_receipt: "/app/purchase-order/goods-receipt",
    sales: "/app/sales/sales",
    sa_sales_line: "/app/sales/sales",
    sales_order: "/app/sales-order/sales-orders",
    shipping_order: "/app/sales-order/shipping/orders",
    purchase_order: "/app/purchase-order/purchase-orders",
    quotation: "/app/quotation/quotations",
    stock_entry: "/app/inventory/stock-entries",
  };
  const label = `${typeLabels[refType] ?? refType.replace(/_/g, " ")}${suffix}`;
  const href = refId && typeHrefs[refType] ? typeHrefs[refType] : undefined;
  return { label, href };
}
