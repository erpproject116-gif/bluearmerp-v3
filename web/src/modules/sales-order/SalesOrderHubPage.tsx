import { useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import { DocumentListViewBar, SALES_ORDER_LIST_VIEWS } from "../../shared/DocumentListViewBar";
import { SalesOrderListPageInner } from "./sales-order/SalesOrderListPage";
import SalesOrderStatusPage from "./sales-order/SalesOrderStatusPage";
import OutstandingSOStatusPage from "./sales-order/OutstandingSOStatusPage";

export default function SalesOrderHubPage() {
  const [params] = useSearchParams();
  const view = () => (typeof params.view === "string" ? params.view : "list");
  return (
    <>
      <DocumentListViewBar basePath="/app/sales-order/sales-orders" views={SALES_ORDER_LIST_VIEWS} />
      <Show when={view() === "status"}>
        <SalesOrderStatusPage />
      </Show>
      <Show when={view() === "outstanding"}>
        <OutstandingSOStatusPage />
      </Show>
      <Show when={view() !== "status" && view() !== "outstanding"}>
        <SalesOrderListPageInner />
      </Show>
    </>
  );
}
