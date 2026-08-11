import { AP_PAYMENT_NAV, OpenPaymentsHub } from "./OpenPaymentsHub";
import { OpenBalancePaymentPage } from "./OpenBalancePaymentPage";

export default function PayablesPaymentPage() {
  return (
    <OpenPaymentsHub side="ap" title="New Payable Payment" nav={AP_PAYMENT_NAV}>
      <OpenBalancePaymentPage side="ap" />
    </OpenPaymentsHub>
  );
}
