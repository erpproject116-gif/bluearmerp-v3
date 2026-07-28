import { createSignal, Show } from "solid-js";
import { SalesListPageInner } from "./SalesListPage";
import type { SalesTemplateCode } from "./SalesLineGrid";
import { GoodsReceiptIShell } from "./GoodsReceiptIShell";
import { ShippingOrdersPageInner } from "../../shipping/ShippingOrdersPage";

type WorkspaceTab = "sales_invoice_i" | "goods_receipt_i" | "shipping_order";

const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "sales_invoice_i", label: "Sales Invoice I" },
  { id: "goods_receipt_i", label: "Goods Receipt I" },
  { id: "shipping_order", label: "Shipping Order" },
];

const TAX_TABS: { code: SalesTemplateCode; label: string }[] = [
  { code: "default", label: "Default" },
  { code: "non_vat", label: "Non-VAT" },
  { code: "vat_included", label: "VAT Included" },
];

export default function SalesNewPage() {
  const [workspace, setWorkspace] = createSignal<WorkspaceTab>("sales_invoice_i");
  const [templateCode, setTemplateCode] = createSignal<SalesTemplateCode>("default");

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

      <Show when={workspace() === "sales_invoice_i"}>
        <div class="mb-4 flex flex-wrap gap-2">
          {TAX_TABS.map((tab) => (
            <button
              type="button"
              class="rounded-full px-3 py-1 text-sm font-medium"
              classList={{
                "bg-brand-50 text-brand-700 ring-1 ring-brand-200": templateCode() === tab.code,
                "border border-stroke text-text-secondary hover:bg-slate-50": templateCode() !== tab.code,
              }}
              onClick={() => setTemplateCode(tab.code)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <SalesListPageInner openNewOnMount templateCode={templateCode()} />
      </Show>

      <Show when={workspace() === "goods_receipt_i"}>
        <GoodsReceiptIShell />
      </Show>

      <Show when={workspace() === "shipping_order"}>
        <ShippingOrdersPageInner openNewOnMount embed />
      </Show>
    </div>
  );
}
