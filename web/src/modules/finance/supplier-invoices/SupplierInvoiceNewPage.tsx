import { createSignal, Show } from "solid-js";
import { SupplierInvoiceListPageInner } from "./SupplierInvoiceListPage";
import { QualityInspRequestShell } from "./QualityInspRequestShell";

type WorkspaceTab = "purchase_invoice_i" | "quality_insp_request";

const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "purchase_invoice_i", label: "Purchase Invoice I" },
  { id: "quality_insp_request", label: "New Quality Insp. Request" },
];

export default function SupplierInvoiceNewPage() {
  const [workspace, setWorkspace] = createSignal<WorkspaceTab>("purchase_invoice_i");

  return (
    <div>
      <div class="mb-3 flex flex-wrap gap-2 border-b border-stroke pb-3">
        {WORKSPACE_TABS.map((tab) => (
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-medium"
            classList={{
              "bg-brand-600 text-white": workspace() === tab.id,
              "border border-stroke text-text-secondary hover:bg-slate-50": workspace() !== tab.id,
            }}
            onClick={() => setWorkspace(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Show when={workspace() === "purchase_invoice_i"}>
        <SupplierInvoiceListPageInner openNewOnMount />
      </Show>

      <Show when={workspace() === "quality_insp_request"}>
        <QualityInspRequestShell />
      </Show>
    </div>
  );
}
