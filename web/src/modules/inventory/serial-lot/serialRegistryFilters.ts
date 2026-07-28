export type SerialRegistryFilters = {
  q?: string;
  serial_no?: string;
  status?: string;
  origin?: string;
  item_id?: number | null;
  location_id?: number | null;
  warranty_end_from?: string;
  warranty_end_to?: string;
};

export function defaultSerialRegistryFilters(): SerialRegistryFilters {
  return {
    q: "",
    serial_no: "",
    status: "",
    item_id: null,
    location_id: null,
    warranty_end_from: "",
    warranty_end_to: "",
  };
}

export const SERIAL_ORIGIN_OPTIONS = [
  { value: "", label: "All origins" },
  { value: "linked", label: "From goods receipt" },
  { value: "manual", label: "Manual registration" },
];

export const SERIAL_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "in_stock", label: "In stock" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "in_transit", label: "In transit" },
  { value: "void", label: "Void" },
  { value: "scrapped", label: "Scrapped" },
  { value: "rma", label: "RMA / repair" },
];

export function serialStatusLabel(status: string): string {
  return SERIAL_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}
