import { createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { inputClass } from "./SpreadsheetGrid";
import { resolveSerialBulk } from "./resolveSerialBulk";
import type { ResolvedSerialUnit } from "./serialScanTypes";
import { useToast } from "./toast";

type Props = {
  locationId?: number | null;
  /** sale = must be in stock; purchase/lookup = any non-void serial to identify item */
  context?: "sale" | "purchase" | "lookup" | "release" | "pos";
  disabled?: boolean;
  placeholder?: string;
  onUnits: (units: ResolvedSerialUnit[]) => void | Promise<void>;
  /**
   * Called for a scanned serial that has no item mapping yet (not registered).
   * Return true if the caller consumed it (e.g. added it as a planned serial to a
   * selected line). When it returns false/undefined the bar shows the fix guidance.
   */
  onUnregistered?: (serialNo: string) => boolean | void;
};

/**
 * Document-level serial scan bar (ECOUNT-style): scan a serial and the parent
 * adds/fills item lines from the resolved unit's item + serial.
 */
export function DocumentSerialScanBar(props: Props) {
  const toast = useToast();
  const [value, setValue] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [lastUnresolved, setLastUnresolved] = createSignal<string | null>(null);
  let inputEl: HTMLInputElement | undefined;

  const isPurchase = () => props.context === "purchase" || props.context === "lookup";

  const submit = async () => {
    const sn = value().trim();
    if (!sn || props.disabled || busy()) return;
    setBusy(true);
    const { units, statuses, errors } = await resolveSerialBulk([sn], {
      locationId: props.locationId,
      context: props.context ?? "sale",
    });
    setBusy(false);

    if (units.length > 0) {
      setValue("");
      setLastUnresolved(null);
      await props.onUnits(units);
      inputEl?.focus();
      return;
    }

    const status = statuses[0] ?? "not_found";
    // Unregistered serial: no item mapping exists. Let the caller try to consume it
    // (e.g. attach as a planned serial to a selected line); otherwise guide the user.
    if (status === "not_found") {
      const consumed = props.onUnregistered?.(sn);
      if (consumed) {
        setValue("");
        setLastUnresolved(null);
        inputEl?.focus();
        return;
      }
      setLastUnresolved(sn);
      toast.warning(
        isPurchase()
          ? `“${sn}” isn’t registered to any item yet. See how to add it below.`
          : `“${sn}” isn’t in stock or isn’t registered. See how to fix it below.`,
      );
      inputEl?.select();
      return;
    }

    // Other reasons (wrong location, unavailable, wrong item) — show the specific message.
    setLastUnresolved(null);
    toast.warning(errors[0] ?? "Serial could not be added.");
    inputEl?.select();
  };

  return (
    <div class="mb-3">
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-xs font-medium uppercase tracking-wide text-text-secondary">Scan serial</label>
        <input
          ref={inputEl}
          class={`${inputClass} min-w-[16rem] flex-1 font-mono text-sm`}
          value={value()}
          disabled={props.disabled || busy()}
          placeholder={props.placeholder ?? "Scan serial no. — Enter adds/fills the item line"}
          title="Scan or type a serial number and press Enter. The item and serial are applied to the lines."
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={props.disabled || busy() || !value().trim()}
          onClick={() => void submit()}
        >
          {busy() ? "…" : "Add"}
        </button>
      </div>

      <Show
        when={lastUnresolved()}
        fallback={
          <p class="mt-1 text-[11px] text-text-secondary">
            Scan a registered serial to auto-fill the item line.{" "}
            {isPurchase()
              ? "New serials are created when you enter them per line and save."
              : "Serials must be in stock (received via Goods Receipt)."}
          </p>
        }
      >
        <div class="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <p class="font-medium">“{lastUnresolved()}” has no item on record. To fix it:</p>
          <Show
            when={isPurchase()}
            fallback={
              <ul class="ml-4 mt-1 list-disc space-y-0.5">
                <li>Confirm the unit was received into stock via a posted Goods Receipt.</li>
                <li>
                  Check the serial in{" "}
                  <A href="/app/inventory/serial-lot/registry" class="font-medium text-brand-600 hover:underline">
                    Inventory → Serial Registry
                  </A>{" "}
                  — it must exist and be in stock at this location.
                </li>
              </ul>
            }
          >
            <ul class="ml-4 mt-1 list-disc space-y-0.5">
              <li>
                Add the item line first (pick the item), then type this serial in its{" "}
                <span class="font-medium">Serial</span> cell — it’s created when you save/receive.
              </li>
              <li>
                Or pre-register it in{" "}
                <A href="/app/inventory/serial-lot/registry" class="font-medium text-brand-600 hover:underline">
                  Inventory → Serial Registry
                </A>
                , then scan again.
              </li>
              <li>Make sure the item has “Track serial numbers” enabled in Inventory → Items.</li>
            </ul>
          </Show>
        </div>
      </Show>
    </div>
  );
}
