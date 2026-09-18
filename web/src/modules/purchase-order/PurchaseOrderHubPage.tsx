import { useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import PurchaseOrderListPage from "../purchase-request/purchase-order/PurchaseOrderListPage";
import PurchaseOrderStatusPage from "./reports/PurchaseOrderStatusPage";
import OutstandingPOStatusPage from "./reports/OutstandingPOStatusPage";

export default function PurchaseOrderHubPage() {
  const [params] = useSearchParams();
  const view = () => (typeof params.view === "string" ? params.view : "list");
  return (
    <>
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
