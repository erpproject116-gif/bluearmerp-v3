import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { apiFetch } from "../../shared/api";
import { ShippingLayout } from "./ShippingLayout";

type DeliveryTrip = {
  id: number;
  trip_date: string;
  trip_no: string;
  driver_name?: string | null;
  vehicle_no?: string | null;
  status: string;
};

export default function DeliveryTripsPage() {
  const { page, setPage, sort, order, toggleSort, pageSize, setPageSize } = useListState("trip_date", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [tripDate, setTripDate] = createSignal("");
  const [driverName, setDriverName] = createSignal("");
  const [vehicleNo, setVehicleNo] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize()),
      sort: sort(),
      order: order(),
    });
    return {
      queryKey: ["delivery-trips", page(), pageSize(), sort(), order()],
      queryFn: async () => {
        const res = await apiFetch<DeliveryTrip[]>(`/api/v1/shipping/trips?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["delivery-trips"] });

  const openNew = () => {
    setTripDate("");
    setDriverName("");
    setVehicleNo("");
    setNotes("");
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await apiFetch("/api/v1/shipping/trips", {
      method: "POST",
      body: JSON.stringify({
        trip_date: tripDate() || undefined,
        driver_name: driverName().trim() || undefined,
        vehicle_no: vehicleNo().trim() || undefined,
        notes: notes().trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create delivery trip.");
      return;
    }
    toast.success("Delivery trip created.");
    setModalOpen(false);
    invalidate();
  };

  return (
    <ShippingLayout>
      <SpreadsheetGrid<DeliveryTrip>
        columns={[
          { key: "trip_no", header: "Trip no.", clickable: true },
          { key: "trip_date", header: "Date" },
          { key: "driver_name", header: "Driver" },
          { key: "vehicle_no", header: "Vehicle" },
          { key: "status", header: "Status" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        settingsHref="/app/sales-order/shipping/trips"
        codeKey="trip_no"
        nameKey="driver_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title="New delivery trip"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Trip date">
          <input type="date" class={inputClass} value={tripDate()} onInput={(e) => setTripDate(e.currentTarget.value)} />
        </Field>
        <Field label="Driver name">
          <input class={inputClass} value={driverName()} onInput={(e) => setDriverName(e.currentTarget.value)} />
        </Field>
        <Field label="Vehicle no.">
          <input class={inputClass} value={vehicleNo()} onInput={(e) => setVehicleNo(e.currentTarget.value)} />
        </Field>
        <Field label="Notes">
          <textarea class={inputClass} rows={2} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </ShippingLayout>
  );
}
