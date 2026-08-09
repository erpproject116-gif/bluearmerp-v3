import { A, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, onMount, Show } from "solid-js";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { DateInput } from "../../../shared/DateInput";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { inventoryRefLink } from "../../../shared/inventoryRefLink";
import {
  patchSerialUnitWarranty,
  useInvalidateSerialLotLists,
  useSerialTrace,
} from "../../../shared/useSerialLotList";
import {
  fetchWarrantyBySerialExact,
  patchWarrantyAsset,
  type WarrantyAsset,
  type WarrantyAssetStatus,
} from "../../../shared/useWarrantyAssets";
import { useToast } from "../../../shared/toast";
import { SerialLotLayout } from "./SerialLotLayout";
import { serialStatusLabel } from "./serialRegistryFilters";

export default function SerialTracePage() {
  const [searchParams] = useSearchParams();
  const [draftSerialNo, setDraftSerialNo] = createSignal("");
  const [submittedSerialNo, setSubmittedSerialNo] = createSignal<string | null>(null);
  const [coverage, setCoverage] = createSignal<WarrantyAsset | null | undefined>(undefined);
  const [unitModalOpen, setUnitModalOpen] = createSignal(false);
  const [coverModalOpen, setCoverModalOpen] = createSignal(false);
  const [editUnitStart, setEditUnitStart] = createSignal("");
  const [editUnitEnd, setEditUnitEnd] = createSignal("");
  const [editCoverEnd, setEditCoverEnd] = createSignal("");
  const [editCoverStatus, setEditCoverStatus] = createSignal<WarrantyAssetStatus>("active");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidateSerial = useInvalidateSerialLotLists();

  const trace = useSerialTrace(() => submittedSerialNo());

  const reloadCoverage = (sn: string) => {
    setCoverage(undefined);
    void fetchWarrantyBySerialExact(sn).then((row) => setCoverage(row));
  };

  const search = () => {
    const sn = draftSerialNo().trim();
    if (!sn) return;
    setSubmittedSerialNo(sn);
  };

  const reset = () => {
    setDraftSerialNo("");
    setSubmittedSerialNo(null);
    setCoverage(undefined);
  };

  createEffect(() => {
    const sn = submittedSerialNo();
    if (!sn) {
      setCoverage(undefined);
      return;
    }
    let cancelled = false;
    setCoverage(undefined);
    void fetchWarrantyBySerialExact(sn).then((row) => {
      if (!cancelled) setCoverage(row);
    });
    return () => {
      cancelled = true;
    };
  });

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

  const isCustomerCoverage = (row: WarrantyAsset) =>
    row.warranty_origin === "sales" || row.sales_id != null;

  const openUnitEdit = () => {
    const u = trace.data?.unit;
    if (!u) return;
    setEditUnitStart(u.warranty_start?.slice(0, 10) ?? "");
    setEditUnitEnd(u.warranty_end?.slice(0, 10) ?? "");
    setUnitModalOpen(true);
  };

  const openCoverEdit = () => {
    const row = coverage();
    if (!row || !isCustomerCoverage(row)) return;
    setEditCoverEnd(row.warranty_end?.slice(0, 10) ?? "");
    setEditCoverStatus(row.status);
    setCoverModalOpen(true);
  };

  const saveUnitDates = async () => {
    const u = trace.data?.unit;
    if (!u) return;
    setSaving(true);
    const res = await patchSerialUnitWarranty(u.id, {
      warranty_start: editUnitStart().trim(),
      warranty_end: editUnitEnd().trim(),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update unit dates.");
      return;
    }
    setUnitModalOpen(false);
    invalidateSerial();
  };

  const saveCoverage = async () => {
    const row = coverage();
    if (!row) return;
    setSaving(true);
    const res = await patchWarrantyAsset(row.id, {
      warranty_end: editCoverEnd(),
      status: editCoverStatus(),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update coverage.");
      return;
    }
    setCoverModalOpen(false);
    const sn = submittedSerialNo();
    if (sn) reloadCoverage(sn);
  };

  return (
    <SerialLotLayout>
      <CollapsibleFilterPanel
        title="Serial detail"
        description="Look up a serial to manage unit warranty dates, customer coverage, and history. Or open a row from Serials."
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
            <p class="mt-2">Enter a serial above, or open a unit from the Serials list.</p>
            <A href="/app/inventory/serial-lot/registry" class="mt-3 inline-block text-brand-600 hover:underline">
              Go to Serials
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
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 class="text-base font-semibold text-text-primary">Unit</h3>
                    <Show when={data().unit.status !== "void"}>
                      <button
                        type="button"
                        class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-slate-50"
                        onClick={openUnitEdit}
                      >
                        Adjust unit dates
                      </button>
                    </Show>
                  </div>
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
                      <dt class="text-text-secondary">Unit warranty dates</dt>
                      <dd class="font-medium">
                        {fmtDate(data().unit.warranty_start)} – {fmtDate(data().unit.warranty_end)}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 class="text-base font-semibold text-text-primary">Customer coverage</h3>
                    <Show when={coverage() && isCustomerCoverage(coverage()!)}>
                      <button
                        type="button"
                        class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-slate-50"
                        onClick={openCoverEdit}
                      >
                        Adjust coverage
                      </button>
                    </Show>
                  </div>
                  <Show
                    when={coverage() !== undefined}
                    fallback={<p class="text-sm text-text-secondary">Checking coverage…</p>}
                  >
                    <Show
                      when={coverage() && isCustomerCoverage(coverage()!)}
                      fallback={
                        <div class="space-y-2 text-sm text-text-secondary">
                          <p>No customer coverage yet — created when this serial is sold.</p>
                          <A href="/app/sales/sales" class="font-medium text-brand-700 hover:underline">
                            Go to Sales
                          </A>
                        </div>
                      }
                    >
                      <dl class="grid gap-2 text-sm md:grid-cols-2">
                        <div>
                          <dt class="text-text-secondary">Customer</dt>
                          <dd class="font-medium">{coverage()!.partner_name || "—"}</dd>
                        </div>
                        <div>
                          <dt class="text-text-secondary">Status</dt>
                          <dd class="font-medium">{coverage()!.status}</dd>
                        </div>
                        <div>
                          <dt class="text-text-secondary">Coverage start</dt>
                          <dd class="font-medium">{fmtDate(coverage()!.warranty_start)}</dd>
                        </div>
                        <div>
                          <dt class="text-text-secondary">Coverage end</dt>
                          <dd class="font-medium">{fmtDate(coverage()!.warranty_end)}</dd>
                        </div>
                      </dl>
                      <div class="mt-3 flex flex-wrap gap-3 text-sm">
                        <A
                          href={`/app/after-sales/warranty?q=${encodeURIComponent(data().unit.serial_no)}&open=${coverage()!.id}`}
                          class="font-medium text-brand-700 hover:underline"
                        >
                          Open Customer Warranty
                        </A>
                        <A
                          href={`/app/after-sales/repair-orders?q=${encodeURIComponent(data().unit.serial_no)}`}
                          class="font-medium text-brand-700 hover:underline"
                        >
                          Repair Orders
                        </A>
                      </div>
                    </Show>
                  </Show>
                </section>

                <SpreadsheetGrid
                  columns={[
                    {
                      key: "created_at",
                      header: "When",
                      clickable: false,
                      render: (r) => r.created_at.slice(0, 19).replace("T", " "),
                    },
                    { key: "event_type", header: "Event", clickable: false },
                    {
                      key: "from_location_name",
                      header: "From",
                      clickable: false,
                      render: (r) => r.from_location_name || "—",
                    },
                    {
                      key: "to_location_name",
                      header: "To",
                      clickable: false,
                      render: (r) => r.to_location_name || "—",
                    },
                    {
                      key: "ref_type",
                      header: "Reference",
                      clickable: false,
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
                    {
                      key: "created_by_name",
                      header: "By",
                      clickable: false,
                      render: (r) => r.created_by_name || "—",
                    },
                    { key: "notes", header: "Notes", clickable: false, render: (r) => r.notes ?? "—" },
                  ]}
                  rows={data().events}
                  loading={trace.isFetching}
                  codeKey="event_type"
                  nameKey="created_at"
                  selectedId={null}
                  onSelect={() => {}}
                  onNew={() => {}}
                  onEdit={() => {}}
                  showNew={false}
                />
              </div>
            )}
          </Show>
        </Show>
      </Show>

      <EntityModal
        open={unitModalOpen()}
        title="Adjust unit warranty dates"
        onClose={() => setUnitModalOpen(false)}
        onSave={() => void saveUnitDates()}
        saving={saving()}
      >
        <p class="mb-3 text-xs text-text-secondary">
          These are the unit receive stamp dates. Changing them does not rewrite customer coverage.
        </p>
        <Field label="Unit warranty start">
          <DateInput value={editUnitStart()} onInput={(e) => setEditUnitStart(e.currentTarget.value)} />
        </Field>
        <Field label="Unit warranty end">
          <DateInput value={editUnitEnd()} onInput={(e) => setEditUnitEnd(e.currentTarget.value)} />
        </Field>
      </EntityModal>

      <EntityModal
        open={coverModalOpen()}
        title="Adjust customer coverage"
        onClose={() => setCoverModalOpen(false)}
        onSave={() => void saveCoverage()}
        saving={saving()}
      >
        <Field label="Coverage end">
          <DateInput value={editCoverEnd()} onInput={(e) => setEditCoverEnd(e.currentTarget.value)} />
        </Field>
        <Field label="Status">
          <select
            class={inputClass}
            value={editCoverStatus()}
            onChange={(e) => setEditCoverStatus(e.currentTarget.value as WarrantyAssetStatus)}
          >
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="void">Void</option>
          </select>
        </Field>
      </EntityModal>
    </SerialLotLayout>
  );
}
