export type SerialSlipType = {
  value: string;
  label: string;
};

/** Slip types for manual serial registration. */
export const SERIAL_SLIP_TYPES: SerialSlipType[] = [
  { value: "quotation", label: "Quotation" },
  { value: "sales_order", label: "Sales Order" },
  { value: "sales", label: "Sales" },
  { value: "shipping_order", label: "Shipping Order" },
  { value: "shipping", label: "Shipping" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "purchases", label: "Purchases" },
  { value: "goods_receipt", label: "Purchase Receive" },
  { value: "consumed", label: "Consumed" },
  { value: "repair_order", label: "Repair Order" },
  { value: "repair", label: "Repair" },
  { value: "location_tran", label: "Location Tran." },
  { value: "goods_issued", label: "Goods Issued" },
  { value: "internal_use", label: "Internal Use" },
  { value: "defect_disassemble_defect", label: "Defect-Disassemble (Defect Item)" },
  { value: "defect_disassemble_normal", label: "Defect-Disassemble (Normal Item)" },
  { value: "defect_usable", label: "Defect-Usable" },
  { value: "defect_dispose", label: "Defect-Dispose" },
  { value: "create_quality_insp_request", label: "Create Quality Insp. Request" },
  { value: "quality_inspection", label: "Quality Inspection" },
  { value: "invoice_packing_list", label: "Invoice/Packing List" },
];

export const DEFAULT_SERIAL_SLIP_TYPE = "quotation";

export function serialSlipTypeLabel(value: string): string {
  return SERIAL_SLIP_TYPES.find((t) => t.value === value)?.label ?? value;
}
