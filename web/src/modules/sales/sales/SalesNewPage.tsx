import { createSignal } from "solid-js";
import { SalesListPageInner } from "./SalesListPage";
import type { SalesTemplateCode } from "./SalesLineGrid";

const TEMPLATE_TABS: { code: SalesTemplateCode; label: string }[] = [
  { code: "default", label: "Default" },
  { code: "non_vat", label: "Non-VAT" },
  { code: "vat_included", label: "VAT Included" },
];

export default function SalesNewPage() {
  const [templateCode, setTemplateCode] = createSignal<SalesTemplateCode>("default");

  return (
    <div>
      <div class="mb-4 flex flex-wrap gap-2 border-b border-stroke pb-3">
        {TEMPLATE_TABS.map((tab) => (
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-medium"
            classList={{
              "bg-brand-600 text-white": templateCode() === tab.code,
              "border border-stroke text-text-secondary hover:bg-slate-50": templateCode() !== tab.code,
            }}
            onClick={() => setTemplateCode(tab.code)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <SalesListPageInner openNewOnMount templateCode={templateCode()} />
    </div>
  );
}
