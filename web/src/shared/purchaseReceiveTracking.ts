export type PurchaseTrackingLine = {
  line_no: number;
  qty: string | number;
  goods_receipt_line_id?: number | null;
  track_serial?: boolean;
  serial_policy?: string;
  serial_nos?: string[];
  track_lot?: boolean;
  lot_policy?: string;
  lot_lines?: { lot_no: string; qty: number }[];
};

export function trackingPolicyIsRequired(policy?: string): boolean {
  return policy?.trim().toLowerCase() !== "optional";
}

export function shouldShowPurchaseSerialScanBar(lines: PurchaseTrackingLine[]): boolean {
  return lines.some((line) => Boolean(line.track_serial));
}

export function validatePurchaseTrackingLine(line: PurchaseTrackingLine): string | null {
  if (line.goods_receipt_line_id) return null;
  const qty = Number(line.qty) || 0;

  if (line.track_serial) {
    const serials = line.serial_nos ?? [];
    if ((serials.length > 0 || trackingPolicyIsRequired(line.serial_policy)) && serials.length !== Math.floor(qty)) {
      return `Line ${line.line_no}: serial count (${serials.length}) must equal qty (${Math.floor(qty)}).`;
    }
  }

  if (line.track_lot) {
    const lots = line.lot_lines ?? [];
    if (lots.length > 0 || trackingPolicyIsRequired(line.lot_policy)) {
      if (lots.some((lot) => !lot.lot_no.trim())) {
        return `Line ${line.line_no}: enter a lot number for every lot quantity.`;
      }
      const total = lots.reduce((sum, lot) => sum + (Number(lot.qty) || 0), 0);
      if (Math.abs(total - qty) > 0.0001) {
        const lotQty = Math.round(total * 10000) / 10000;
        const lineQty = Math.round(qty * 10000) / 10000;
        return `Line ${line.line_no}: lot qty (${lotQty}) must equal line qty (${lineQty}).`;
      }
    }
  }

  return null;
}
