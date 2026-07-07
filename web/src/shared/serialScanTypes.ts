export type ResolvedSerialUnit = {
  serial_unit_id: number;
  serial_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  item_category_id?: number | null;
  item_category_name?: string;
  custom_values?: Record<string, unknown>;
  manufacturer?: string;
  status: string;
  location_id?: number | null;
  location_name?: string;
  partner_id?: number | null;
  partner_name?: string;
  warranty_end?: string | null;
};

export type ResolveScanBatchResult = {
  client_scan_id?: string;
  serial_no: string;
  status: string;
  message?: string;
  unit?: ResolvedSerialUnit;
};

export function unitsFromIdsAndLabels(ids: number[], labels: string, itemHint?: Partial<ResolvedSerialUnit>): ResolvedSerialUnit[] {
  const nos = labels.split(/,\s*/).filter(Boolean);
  return ids.map((id, i) => ({
    serial_unit_id: id,
    serial_no: nos[i] ?? `#${id}`,
    item_id: itemHint?.item_id ?? 0,
    item_code: itemHint?.item_code ?? "—",
    item_name: itemHint?.item_name ?? "—",
    item_category_name: itemHint?.item_category_name,
    manufacturer: itemHint?.manufacturer,
    status: itemHint?.status ?? "in_stock",
    location_name: itemHint?.location_name,
  }));
}

export function serialUnitsToChange(units: ResolvedSerialUnit[]): { ids: number[]; labels: string; qty: string } {
  const ids = units.map((u) => u.serial_unit_id);
  const labels = units.map((u) => u.serial_no).join(", ");
  return { ids, labels, qty: String(ids.length) };
}
