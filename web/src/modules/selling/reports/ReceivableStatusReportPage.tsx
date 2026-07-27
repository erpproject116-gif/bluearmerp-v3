import { SalesLayout } from "../../sales/SalesLayout";
import { ArApAsOfReportView } from "../../finance/reports/ArApAsOfReportView";

export default function ReceivableStatusReportPage() {
  return (
    <SalesLayout>
      <ArApAsOfReportView
        mode="receivable"
        title="Receivable Status"
        subtitle="Open customer receivable balances as-of a single date."
      />
    </SalesLayout>
  );
}
