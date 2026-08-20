import { useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import { DocumentListViewBar, PURCHASE_RECEIVE_LIST_VIEWS } from "../../../shared/DocumentListViewBar";
import PurchaseStatusPage from "../../buying/reports/PurchaseStatusPage";
import { SupplierInvoiceListPageInner } from "./SupplierInvoiceListPage";

export default function PurchaseReceiveHubPage() {
  const [params] = useSearchParams();
  const view = () => (typeof params.view === "string" ? params.view : "list");
  return (
    <>
      <DocumentListViewBar basePath="/app/purchases/purchase-receive" views={PURCHASE_RECEIVE_LIST_VIEWS} />
      <Show when={view() === "status"}>
        <PurchaseStatusPage />
      </Show>
      <Show when={view() !== "status"}>
        <SupplierInvoiceListPageInner />
      </Show>
    </>
  );
}
