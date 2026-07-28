import { createSignal, onMount } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { apiFetch } from "../../shared/api";
import { formatMoney } from "../../shared/money";
import { ShippingLayout } from "./ShippingLayout";

type ShippingOrder = {
  id: number;
  shipping_date: string;
  shipping_no: string;
  sales_order_id?: number | null;
  partner_id: number;
  partner_name?: string;
  location_id: number;
  status: string;
  shipping_zone?: string | null;
  carrier?: string | null;
  freight_amount?: number | null;
};

type PageOptions = {
  openNewOnMount?: boolean;
  /** Skip ShippingLayout wrapper when embedded in another workspace (e.g. New Sales). */
  embed?: boolean;
};

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? []).map((p) => ({ id: p.id, label: p.company_name }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

export function ShippingOrdersPageInner(props: PageOptions = {}) {
  const { page, setPage, sort, order, toggleSort, pageSize } = useListState("shipping_date", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [shippingDate, setShippingDate] = createSignal("");
  const [salesOrderId, setSalesOrderId] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [shippingZone, setShippingZone] = createSignal("");
  const [carrier, setCarrier] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize),
      sort: sort(),
      order: order(),
    });
    return {
      queryKey: ["shipping-orders", page(), pageSize, sort(), order()],
      queryFn: async () => {
        const res = await apiFetch<ShippingOrder[]>(`/api/v1/shipping/orders?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["shipping-orders"] });

  const openNew = () => {
    setShippingDate("");
    setSalesOrderId("");
    setPartnerId(null);
    setPartnerLabel("");
    setLocationId(null);
    setLocationLabel("");
    setShippingZone("");
    setCarrier("");
    setNotes("");
    setModalOpen(true);
  };

  onMount(() => {
    if (props.openNewOnMount) openNew();
  });

  const save = async () => {
    if (!partnerId() || !locationId()) {
      toast.warning("Partner and location are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/shipping/orders", {
      method: "POST",
      body: JSON.stringify({
        shipping_date: shippingDate() || undefined,
        sales_order_id: salesOrderId() ? Number(salesOrderId()) : undefined,
        partner_id: partnerId(),
        location_id: locationId(),
        shipping_zone: shippingZone().trim() || undefined,
        carrier: carrier().trim() || undefined,
        notes: notes().trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create shipping order.");
      return;
    }
    toast.success("Shipping order created.");
    setModalOpen(false);
    invalidate();
  };

  const body = (
    <>
      <SpreadsheetGrid<ShippingOrder>
        columns={[
          { key: "shipping_no", header: "Shipping no.", clickable: true },
          { key: "shipping_date", header: "Date" },
          { key: "partner_name", header: "Customer" },
          { key: "shipping_zone", header: "Zone" },
          { key: "carrier", header: "Carrier" },
          {
            key: "freight_amount",
            header: "Freight",
            render: (r) =>
              r.freight_amount != null ? formatMoney(r.freight_amount) : "—",
          },
          { key: "status", header: "Status" },
          { key: "sales_order_id", header: "Sales order" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        settingsHref="/app/sales-order/shipping/orders"
        codeKey="shipping_no"
        nameKey="partner_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title="New shipping order"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Shipping date">
          <input
            type="date"
            class={inputClass}
            value={shippingDate()}
            onInput={(e) => setShippingDate(e.currentTarget.value)}
          />
        </Field>
        <Field label="Sales order ID (optional)">
          <input
            type="number"
            class={inputClass}
            value={salesOrderId()}
            onInput={(e) => setSalesOrderId(e.currentTarget.value)}
          />
        </Field>
        <LookupCombo
          label="Customer"
          required
          value={() => partnerLabel()}
          selectedId={() => partnerId()}
          onInput={setPartnerLabel}
          onSelect={(o) => {
            setPartnerId(o.id);
            setPartnerLabel(o.label);
          }}
          onClear={() => {
            setPartnerId(null);
            setPartnerLabel("");
          }}
          fetchOptions={fetchPartners}
        />
        <LookupCombo
          label="Location"
          required
          value={() => locationLabel()}
          selectedId={() => locationId()}
          onInput={setLocationLabel}
          onSelect={(o) => {
            setLocationId(o.id);
            setLocationLabel(o.label);
          }}
          onClear={() => {
            setLocationId(null);
            setLocationLabel("");
          }}
          fetchOptions={fetchLocations}
        />
        <Field label="Shipping zone">
          <input class={inputClass} value={shippingZone()} onInput={(e) => setShippingZone(e.currentTarget.value)} placeholder="Matches freight rules" />
        </Field>
        <Field label="Carrier">
          <input class={inputClass} value={carrier()} onInput={(e) => setCarrier(e.currentTarget.value)} />
        </Field>
        <Field label="Notes">
          <textarea class={inputClass} rows={2} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </>
  );

  if (props.embed) return body;
  return <ShippingLayout>{body}</ShippingLayout>;
}

export default function ShippingOrdersPage() {
  return <ShippingOrdersPageInner />;
}
