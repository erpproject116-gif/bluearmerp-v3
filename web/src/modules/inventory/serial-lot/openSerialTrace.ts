/** Navigate to Serial detail (unit dates, customer coverage, history). */
export function serialTraceHref(serialNo: string): string {
  const sn = serialNo.trim();
  return `/app/inventory/serial-lot/trace?serial_no=${encodeURIComponent(sn)}`;
}

export function openSerialTrace(navigate: (to: string) => void, serialNo: string) {
  const sn = serialNo.trim();
  if (!sn) return;
  navigate(serialTraceHref(sn));
}
