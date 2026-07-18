import { createSignal, For, Show } from "solid-js";
import type { MeData } from "./auth-context";
import { isTenantModuleEnabled } from "./moduleAccess";

export type LoadSlipOption = {
  id: string;
  label: string;
  group: string;
  disabled?: boolean;
  hint?: string;
};

type Props = {
  label?: string;
  options: LoadSlipOption[];
  onSelect: (id: string) => void;
  disabled?: boolean;
};

export function LoadSlipMenu(props: Props) {
  const [open, setOpen] = createSignal(false);

  const groups = () => {
    const map = new Map<string, LoadSlipOption[]>();
    for (const opt of props.options) {
      const list = map.get(opt.group) ?? [];
      list.push(opt);
      map.set(opt.group, list);
    }
    return [...map.entries()];
  };

  return (
    <div class="relative inline-block">
      <button
        type="button"
        class="rounded border border-stroke px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 disabled:opacity-50"
        disabled={props.disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {props.label ?? "Load Slip"}
      </button>
      <Show when={open()}>
        <div
          class="fixed inset-0 z-[55]"
          onClick={() => setOpen(false)}
        />
        <div class="absolute left-0 top-full z-[56] mt-1 max-h-[60vh] w-72 overflow-auto rounded-lg border border-stroke bg-white py-1 shadow-lg">
          <For each={groups()}>
            {([group, opts]) => (
              <div class="border-b border-stroke/60 last:border-0">
                <p class="px-3 py-1.5 text-xs font-semibold uppercase text-text-secondary">{group}</p>
                <For each={opts}>
                  {(opt) => (
                    <button
                      type="button"
                      class="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={opt.disabled}
                      title={opt.hint}
                      onClick={() => {
                        if (opt.disabled) return;
                        setOpen(false);
                        props.onSelect(opt.id);
                      }}
                    >
                      <span>{opt.label}</span>
                      <Show when={opt.hint}>
                        <span class="text-xs text-text-secondary">{opt.hint}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export const PURCHASE_LOAD_SLIP_OPTIONS: LoadSlipOption[] = [
  { id: "po", label: "Purchase Order", group: "Purchases", hint: "Open PO lines with residual qty" },
  { id: "gr", label: "Goods Receipt (Receiving)", group: "Purchases", hint: "Posted GR lines not yet invoiced" },
  { id: "pr", label: "Purchase Request", group: "Purchases", hint: "Open PR lines (use on new PO)", disabled: true },
  { id: "rfq", label: "Supplier Quotation (RFQ)", group: "Purchases", hint: "PO lines sourced from accepted vendor quotes" },
];

export const PURCHASE_ORDER_LOAD_SLIP_OPTIONS: LoadSlipOption[] = [
  { id: "pr", label: "Purchase Request", group: "Purchases", hint: "Open PR lines with balance qty" },
  { id: "rfq", label: "Supplier Quotation (RFQ)", group: "Purchases", hint: "Accepted vendor quotes not yet on a PO" },
];

export const SALES_LOAD_SLIP_OPTIONS: LoadSlipOption[] = [
  { id: "so", label: "Sales Order", group: "Sales", hint: "Open SO lines for invoicing" },
  { id: "quotation", label: "Quotation", group: "Sales", hint: "Open quotation lines (populate invoice)" },
  { id: "shipping", label: "Shipping Order", group: "Sales", hint: "SO lines linked to a shipping order" },
];

export const SALES_ORDER_LOAD_SLIP_OPTIONS: LoadSlipOption[] = [
  { id: "quotation", label: "Quotation", group: "Sales", hint: "Open quotation lines with balance qty" },
];

/** Map Load Slip option id → tenant module that must be enabled. */
const LOAD_SLIP_MODULE: Record<string, string> = {
  quotation: "quotation",
  so: "sales_order",
  shipping: "sales_order",
  pr: "purchase_request",
  po: "purchase_order",
  gr: "purchase_order",
  rfq: "purchase_order",
};

/** Drop or disable Load Slip sources whose module is turned off. */
export function filterLoadSlipOptions(
  options: LoadSlipOption[],
  me: MeData | null | undefined,
  mode: "omit" | "disable" = "omit",
): LoadSlipOption[] {
  return options
    .map((opt) => {
      const mod = LOAD_SLIP_MODULE[opt.id];
      if (!mod || isTenantModuleEnabled(me, mod)) return opt;
      if (mode === "disable") {
        return { ...opt, disabled: true, hint: opt.hint ?? "Module turned off for this workspace" };
      }
      return null;
    })
    .filter((o): o is LoadSlipOption => o != null);
}
