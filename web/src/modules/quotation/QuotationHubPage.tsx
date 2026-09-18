import { useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import { QuotationListPageInner } from "./quotation/QuotationListPage";
import QuotationStatusPage from "./quotation/QuotationStatusPage";
import OutstandingQuoteStatusPage from "./quotation/OutstandingQuoteStatusPage";

export default function QuotationHubPage() {
  const [params] = useSearchParams();
  const view = () => (typeof params.view === "string" ? params.view : "list");
  return (
    <>
      <Show when={view() === "status"}>
        <QuotationStatusPage />
      </Show>
      <Show when={view() === "outstanding"}>
        <OutstandingQuoteStatusPage />
      </Show>
      <Show when={view() !== "status" && view() !== "outstanding"}>
        <QuotationListPageInner />
      </Show>
    </>
  );
}
