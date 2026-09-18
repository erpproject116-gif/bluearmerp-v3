import { useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import { listViewParam } from "../../shared/DocumentListViewBar";
import { SalesListPageInner } from "./sales/SalesListPage";
import SalesHistoryPage from "./sales/SalesHistoryPage";
import SalesStatusPage from "./sales/SalesStatusPage";

export default function SalesHubPage() {
  const [params] = useSearchParams();
  const view = () => listViewParam(params.view) || "list";
  return (
    <>
      <Show when={view() === "status"}>
        <SalesStatusPage />
      </Show>
      <Show when={view() === "history"}>
        <SalesHistoryPage />
      </Show>
      <Show when={view() !== "status" && view() !== "history"}>
        <SalesListPageInner />
      </Show>
    </>
  );
}
