import { A, useSearchParams } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { inventoryRefLink } from "../../../shared/inventoryRefLink";
import { useSerialTrace } from "../../../shared/useSerialLotList";
import { SerialLotLayout } from "./SerialLotLayout";
import { serialStatusLabel } from "./serialRegistryFilters";

export default function SerialTracePage() {
  const [searchParams] = useSearchParams();
  const [draftSerialNo, setDraftSerialNo] = createSignal("");
  const [submittedSerialNo, setSubmittedSerialNo] = createSignal<string | null>(null);

  const trace = useSerialTrace(() => submittedSerialNo());

  const search = () => {
    const sn = draftSerialNo().trim();
    if (!sn) return;
    setSubmittedSerialNo(sn);
  };

  const reset = () => {
    setDraftSerialNo("");
    setSubmittedSerialNo(null);
  };

  onMount(() => {
    const raw = searchParams.serial_no;
    const fromUrl = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? "").trim() : "";
    if (fromUrl) {
      setDraftSerialNo(fromUrl);
      setSubmittedSerialNo(fromUrl);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fmtDate = (v?: string | null) => (v ? v.slice(0, 10) : "—");

  return (
    <SerialLotLayout>
      <CollapsibleFilterPanel
        title="Lookup serial"
        description="Enter a serial number, then Search (F8). Or open Trace from Registry."
        actions={
          <>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={search}
            >
              Search (F8)
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
              onClick={reset}
            >
              Reset
            </button>
          </>
        }
      >
        <div class="max-w-md">
          <Field label="Serial no.">
            <input
              class={inputClass}
              value={draftSerialNo()}
              onInput={(e) => setDraftSerialNo(e.currentTarget.value)}
              placeholder="Scan or type serial number…"
              autofocus
            />
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <Show
        when={submittedSerialNo()}
        fallback={
          <div class="mt-6 rounded-xl border border-stroke bg-white p-8 text-center text-sm text-text-secondary shadow-sm">
            <p class="font-medium text-text-primary">No serial selected</p>
            <p class="mt-2">Enter a serial or open Trace from Registry.</p>
            <A href="/app/inventory/serial-lot/registry" class="mt-3 inline-block text-brand-600 hover:underline">
              Go to Registry
            </A>
          </div>
        }
      >
        <Show
          when={!trace.isError}
          fallback={
            <div class="mt-6 rounded-xl border border-stroke bg-white p-5 text-sm text-red-600">
              {trace.error instanceof Error ? trace.error.message : "Serial not found."}
            </div>
          }
        >
          <Show when={trace.data}>
            {(data) => (
              <div class="mt-6 space-y-6">
                <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
                  <h3 class="mb-3 text-base font-semibold text-text-primary">Unit</h3>
                  <dl class="grid gap-2 text-sm md:grid-cols-2">
                    <div>
                      <dt class="text-text-secondary">Serial no.</dt>
                      <dd class="font-medium">{data().unit.serial_no}</dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">Status</dt>
                      <dd class="font-medium">{serialStatusLabel(data().unit.status)}</dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">Item</dt>
                      <dd class="font-medium">
                        {data().unit.item_code} — {data().unit.item_name}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">Location</dt>
                      <dd class="font-medium">{data().unit.location_name || "—"}</dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">Partner</dt>
                      <dd class="font-medium">{data().unit.partner_name || "—"}</dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">PO no.</dt>
                      <dd class="font-medium">{data().unit.purchase_order_no ?? "—"}</dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">PR no.</dt>
                      <dd class="font-medium">{data().links.purchase_request_no ?? "—"}</dd>
                    </div>
                    <div>
                      <dt class="text-text-secondary">Warranty</dt>
                      <dd class="font-medium">
                        {fmtDate(data().unit.warranty_start)} – {fmtDate(data().unit.warranty_end)}
                      </dd>
                    </div>
                  </dl>
                </section>

                <SpreadsheetGrid
                  columns={[
                    { key: "created_at", header: "When", render: (r) => r.created_at.slice(0, 19).replace("T", " ") },
                    { key: "event_type", header: "Event" },
                    { key: "from_location_name", header: "From", render: (r) => r.from_location_name || "—" },
                    { key: "to_location_name", header: "To", render: (r) => r.to_location_name || "—" },
                    {
                      key: "ref_type",
                      header: "Reference",
                      render: (r) => {
                        const link = inventoryRefLink(r.ref_type, r.ref_id);
                        return link.href ? (
                          <A href={link.href} class="text-brand-600 hover:underline">
                            {link.label}
                          </A>
                        ) : (
                          link.label
                        );
                      },
                    },
                    { key: "created_by_name", header: "By", render: (r) => r.created_by_name || "—" },
                    { key: "notes", header: "Notes", render: (r) => r.notes ?? "—" },
                  ]}
                  rows={data().events}
                  loading={trace.isFetching}
                  codeKey="event_type"
                  nameKey="created_at"
                  selectedId={null}
                  onSelect={() => {}}
                  onNew={() => {}}
                  onEdit={() => {}}
                />
              </div>
            )}
          </Show>
        </Show>
      </Show>
    </SerialLotLayout>
  );
}
