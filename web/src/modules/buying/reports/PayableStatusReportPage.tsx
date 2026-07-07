import { ArApAsOfReportView } from "../../finance/reports/ArApAsOfReportView";

export default function PayableStatusReportPage() {
  return (
    <ArApAsOfReportView
      mode="payable"
      title="Payable Status"
      subtitle="Open vendor payable balances as-of a single date (E040722)."
    />
  );
}
