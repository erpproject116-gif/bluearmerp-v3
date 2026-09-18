import { useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import PurchaseStatusPage from "../../buying/reports/PurchaseStatusPage";
import GoodsReceiptListPage from "../../purchase-request/goods-receipt/GoodsReceiptListPage";
import { SupplierInvoiceListPageInner } from "./SupplierInvoiceListPage";

export default function PurchaseReceiveHubPage() {
  const [params] = useSearchParams();
  const view = () => (typeof params.view === "string" ? params.view : "list");
  return (
    <>
      <Show when={view() === "status"}>
        <PurchaseStatusPage />
      </Show>
      <Show when={view() === "history"}>
        <GoodsReceiptListPage />
      </Show>
      <Show when={view() !== "status" && view() !== "history"}>
        <SupplierInvoiceListPageInner />
      </Show>
    </>
  );
}
