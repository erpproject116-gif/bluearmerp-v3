import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { apiFetch } from "../../shared/api";
import { ShippingLayout } from "./ShippingLayout";

type ShippingRule = {
  id: number;
  name: string;
  zone?: string | null;
  carrier?: string | null;
  min_weight?: number | null;
  max_weight?: number | null;
  flat_amount?: number | null;
  active: boolean;
};

export default function ShippingRulesPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [zone, setZone] = createSignal("");
  const [carrier, setCarrier] = createSignal("");
  const [flatAmount, setFlatAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["shipping-rules"],
    queryFn: async () => {
      const res = await apiFetch<ShippingRule[]>("/api/v1/shipping/shipping-rules");
      if (!res.success) throw new Error(res.message ?? "Failed to load rules");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const openNew = () => {
    setName("");
    setZone("");
    setCarrier("");
    setFlatAmount("");
    setModalOpen(true);
  };

  const save = async () => {
    if (!name().trim()) {
      toast.warning("Name is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<ShippingRule>("/api/v1/shipping/shipping-rules", {
      method: "POST",
      body: JSON.stringify({
        name: name().trim(),
        zone: zone().trim() || null,
        carrier: carrier().trim() || null,
        flat_amount: flatAmount() ? Number(flatAmount()) : null,
        active: true,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create rule.");
      return;
    }
    toast.success("Shipping rule created.");
    setModalOpen(false);
    void client.invalidateQueries({ queryKey: ["shipping-rules"] });
  };

  return (
    <ShippingLayout>
      <div class="space-y-4">
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h2 class="text-lg font-semibold text-text-primary">Shipping rules</h2>
          <p class="mt-1 text-sm text-text-secondary">
            ECOUNT-style freight rules — flat amounts matched by zone and carrier when creating shipping orders.
          </p>
        </section>
        <SpreadsheetGrid<ShippingRule>
          columns={[
            { key: "name", header: "Name", clickable: true },
            { key: "zone", header: "Zone" },
            { key: "carrier", header: "Carrier" },
            {
              key: "flat_amount",
              header: "Flat freight",
              render: (r) =>
                r.flat_amount != null
                  ? r.flat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })
                  : "—",
            },
            { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
          ]}
          rows={list.data?.rows ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onNew={openNew}
          onEdit={() => {}}
          codeKey="name"
          nameKey="name"
          total={list.data?.total ?? 0}
          search=""
          onSearchChange={() => {}}
          onRefresh={() => void client.invalidateQueries({ queryKey: ["shipping-rules"] })}
        />
        <EntityModal
          open={modalOpen()}
          title="New shipping rule"
          onClose={() => setModalOpen(false)}
          onSave={() => void save()}
          saving={saving()}
          singleColumn
        >
          <Field label="Name *">
            <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          </Field>
          <Field label="Zone (optional)">
            <input class={inputClass} value={zone()} onInput={(e) => setZone(e.currentTarget.value)} placeholder="e.g. NCR" />
          </Field>
          <Field label="Carrier (optional)">
            <input class={inputClass} value={carrier()} onInput={(e) => setCarrier(e.currentTarget.value)} />
          </Field>
          <Field label="Flat freight amount">
            <input
              class={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={flatAmount()}
              onInput={(e) => setFlatAmount(e.currentTarget.value)}
            />
          </Field>
        </EntityModal>
      </div>
    </ShippingLayout>
  );
}
