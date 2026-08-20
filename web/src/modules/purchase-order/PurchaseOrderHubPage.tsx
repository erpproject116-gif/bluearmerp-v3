import { useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import { DocumentListViewBar, PURCHASE_ORDER_LIST_VIEWS } from "../../shared/DocumentListViewBar";
import PurchaseOrderListPage from "../purchase-request/purchase-order/PurchaseOrderListPage";
import PurchaseOrderStatusPage from "./reports/PurchaseOrderStatusPage";
import OutstandingPOStatusPage from "./reports/OutstandingPOStatusPage";

export default function PurchaseOrderHubPage() {
  const [params] = useSearchParams();
  const view = () => (typeof params.view === "string" ? params.view : "list");
  return (
    <>
      <DocumentListViewBar basePath="/app/purchase-order/purchase-orders" views={PURCHASE_ORDER_LIST_VIEWS} />
      <Show when={view() === "status"}>
        <PurchaseOrderStatusPage />
      </Show>
      <Show when={view() === "outstanding"}>
        <OutstandingPOStatusPage />
      </Show>
      <Show when={view() !== "status" && view() !== "outstanding"}>
        <PurchaseOrderListPage />
      </Show>
    </>
  );
}
