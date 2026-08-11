import { AR_PAYMENT_NAV, OpenPaymentsHub } from "./OpenPaymentsHub";
import { OpenBalancePaymentPage } from "./OpenBalancePaymentPage";

export default function ReceivablesPaymentPage() {
  return (
    <OpenPaymentsHub side="ar" title="New Receivable Payment" nav={AR_PAYMENT_NAV}>
      <OpenBalancePaymentPage side="ar" />
    </OpenPaymentsHub>
  );
}
