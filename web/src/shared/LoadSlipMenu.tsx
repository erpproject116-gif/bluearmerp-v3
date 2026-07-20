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

type PartnerKind = "customer" | "vendor";

type Props = {
  label?: string;
  options: LoadSlipOption[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  /** When set, shows a guided hint while Load Slip is disabled (no partner selected). */
  partnerLabel?: PartnerKind;
};

function partnerHintText(kind: PartnerKind): string {
  const noun = kind === "vendor" ? "Vendor" : "Customer";
  return `Select a ${noun} first — Load Slip stays locked until then so it only lists open lines for that ${noun.toLowerCase()}.`;
}

export function LoadSlipMenu(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [nudge, setNudge] = createSignal(false);

  const groups = () => {
    const map = new Map<string, LoadSlipOption[]>();
    for (const opt of props.options) {
      const list = map.get(opt.group) ?? [];
      list.push(opt);
      map.set(opt.group, list);
    }
    return [...map.entries()];
  };

  const empty = () => props.options.length === 0;
  const needsPartner = () => Boolean(props.disabled && props.partnerLabel);
  /** Native disabled only when there is nothing useful to click for (empty modules, no partner hint). */
  const hardDisabled = () => empty() && !props.partnerLabel;
  const locked = () => Boolean(props.disabled) || empty();
  const showGuide = () => needsPartner() || (nudge() && locked());

  const guideText = () => {
    if (props.disabled && props.partnerLabel) return partnerHintText(props.partnerLabel);
    if (empty()) {
      return "No Load Slip sources available. Enable Quotation, Sales Order, and/or Purchase Order under User Management → Module & Features.";
    }
    if (props.disabled) return "Load Slip is not available on this document right now.";
    return "";
  };

  const onButtonClick = () => {
    if (props.disabled || empty()) {
      setNudge(true);
      setOpen(false);
      return;
    }
    setNudge(false);
    setOpen((v) => !v);
  };

  return (
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative inline-block">
        <button
          type="button"
          class="rounded border border-stroke px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          classList={{
            "cursor-not-allowed opacity-50 ring-2 ring-amber-400 ring-offset-1": locked() && !hardDisabled(),
            "ring-2 ring-amber-400 ring-offset-1": needsPartner(),
          }}
          disabled={hardDisabled()}
          aria-disabled={locked() ? true : undefined}
          aria-describedby={showGuide() ? "load-slip-guide" : undefined}
          title={guideText() || undefined}
          onClick={onButtonClick}
        >
          {props.label ?? "Load Slip"}
        </button>
        <Show when={open() && !locked()}>
          <div class="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
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

      <Show when={showGuide() && guideText()}>
        <p
          id="load-slip-guide"
          class="max-w-md rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950"
          role="status"
        >
          <span class="font-semibold">Tip: </span>
          {guideText()}
        </p>
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

/** Drop or disable Load Slip sources whose module is turned off.
 * Default "disable" keeps the menu visible with a hint instead of looking "gone".
 */
export function filterLoadSlipOptions(
  options: LoadSlipOption[],
  me: MeData | null | undefined,
  mode: "omit" | "disable" = "disable",
): LoadSlipOption[] {
  return options
    .map((opt) => {
      const mod = LOAD_SLIP_MODULE[opt.id];
      if (!mod || isTenantModuleEnabled(me, mod)) return opt;
      if (mode === "disable") {
        return {
          ...opt,
          disabled: true,
          hint: "Module turned off — enable it under User Management → Module & Features",
        };
      }
      return null;
    })
    .filter((o): o is LoadSlipOption => o != null);
}
