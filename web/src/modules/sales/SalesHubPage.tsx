import { useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import { DocumentListViewBar, SALES_LIST_VIEWS } from "../../shared/DocumentListViewBar";
import { SalesListPageInner } from "./sales/SalesListPage";
import SalesStatusPage from "./sales/SalesStatusPage";

export default function SalesHubPage() {
  const [params] = useSearchParams();
  const view = () => (typeof params.view === "string" ? params.view : "list");
  return (
    <>
      <DocumentListViewBar basePath="/app/sales/sales" views={SALES_LIST_VIEWS} />
      <Show when={view() === "status"}>
        <SalesStatusPage />
      </Show>
      <Show when={view() !== "status"}>
        <SalesListPageInner />
      </Show>
    </>
  );
}
