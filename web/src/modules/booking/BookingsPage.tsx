import { createSignal, createResource, For, Show, createEffect } from "solid-js";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { Modal } from "../../shared/Modal";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { LookupCombo } from "../../shared/LookupCombo";

type Booking = {
  id: number;
  booking_no: string;
  booking_date: string;
  starts_at: string;
  ends_at: string;
  status: string;
  partner_id?: number | null;
  partner_name?: string;
  resource_id?: number | null;
  resource_name?: string;
  service_id?: number | null;
  service_name?: string;
  title: string;
  notes?: string;
  quotation_id?: number | null;
};

type Resource = { id: number; code: string; name: string; resource_type: string; is_active: boolean };
type Service = {
  id: number;
  code: string;
  name: string;
  duration_minutes: number;
  unit_price: number;
  is_active: boolean;
};

const STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];
type BookingTab = "bookings" | "resources" | "services";

function tabFromPath(pathname: string): BookingTab {
  if (pathname.includes("/resources")) return "resources";
  if (pathname.includes("/services")) return "services";
  return "bookings";
}

function pathForTab(tab: BookingTab) {
  if (tab === "resources") return "/app/booking/resources";
  if (tab === "services") return "/app/booking/services";
  return "/app/booking/bookings";
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string) {
  const d = new Date(local);
  return d.toISOString();
}

export default function BookingsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const loc = useLocation();
  const navigate = useNavigate();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize, statusFilter, setStatusFilter } = useListState(
    "starts_at",
    25,
    { defaultOrder: "asc", defaultStatus: "" },
  );
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Booking | null>(null);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [setupTab, setSetupTab] = createSignal<BookingTab>(tabFromPath(loc.pathname));

  createEffect(() => {
    setSetupTab(tabFromPath(loc.pathname));
  });

  const goTab = (tab: BookingTab) => {
    setSetupTab(tab);
    navigate(pathForTab(tab));
  };

  const list = createQuery(() => ({
    queryKey: ["bookings", page(), q(), sort(), order(), statusFilter()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize),
        sort: sort(),
        order: order(),
      });
      if (q()) qs.set("q", q());
      if (statusFilter()) qs.set("status", statusFilter());
      const res = await apiFetch<Booking[]>(`/api/v1/booking/bookings?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load bookings");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  }));

  const [resources, { refetch: refetchResources }] = createResource(async () => {
    const res = await apiFetch<Resource[]>("/api/v1/booking/resources");
    return res.success ? (res.data ?? []) : [];
  });
  const [services, { refetch: refetchServices }] = createResource(async () => {
    const res = await apiFetch<Service[]>("/api/v1/booking/services");
    return res.success ? (res.data ?? []) : [];
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["bookings"] });

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const convert = async (row: Booking) => {
    const res = await apiFetch<{ quotation_id: number; reference_no: string }>(
      `/api/v1/booking/bookings/${row.id}/to-quotation`,
      { method: "POST", body: "{}" },
    );
    if (!res.success) {
      toast.warning(res.message ?? "Could not create quotation.");
      return;
    }
    toast.success(`Quotation ${res.data?.reference_no ?? ""} created.`);
    invalidate();
  };

  return (
    <div class="space-y-4">
      <div>
        <h1 class="text-2xl font-semibold text-text-primary">Booking</h1>
        <p class="mt-1 text-sm text-text-secondary">
          Schedule resources and services, then convert bookings to quotations when ready.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <A href="/app/booking/calendar" class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-brand-700">
          Calendar
        </A>
        <For each={["bookings", "resources", "services"] as const}>
          {(tab) => (
            <A
              href={pathForTab(tab)}
              class={`rounded-lg px-3 py-1.5 text-sm ${setupTab() === tab ? "bg-brand-600 text-white" : "border border-stroke"}`}
              onClick={(e) => {
                e.preventDefault();
                goTab(tab);
              }}
            >
              {tab[0]!.toUpperCase() + tab.slice(1)}
            </A>
          )}
        </For>
      </div>

      <Show when={setupTab() === "bookings"}>
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <label class="text-sm text-text-secondary">
            Status
            <select
              class="ml-2 rounded border border-stroke px-2 py-1 text-sm"
              value={statusFilter()}
              onChange={(e) => setStatusFilter(e.currentTarget.value)}
            >
              <option value="">All</option>
              <For each={STATUSES}>{(s) => <option value={s}>{s.replace("_", " ")}</option>}</For>
            </select>
          </label>
        </div>
        <SpreadsheetGrid
          columns={[
            { key: "booking_no", header: "Booking #", clickable: true },
            { key: "starts_at", header: "Starts", sortable: true },
            { key: "title", header: "Title" },
            { key: "partner_name", header: "Customer" },
            { key: "resource_name", header: "Resource" },
            { key: "service_name", header: "Service" },
            { key: "status", header: "Status" },
            {
              key: "quotation_id",
              header: "Quotation",
              render: (r: Booking) =>
                r.quotation_id ? (
                  <A class="text-brand-600 hover:underline" href={`/app/quotation/quotations`}>
                    #{r.quotation_id}
                  </A>
                ) : (
                  <button type="button" class="text-xs text-brand-600 hover:underline" onClick={() => void convert(r)}>
                    Convert to quotation
                  </button>
                ),
            },
          ]}
          rows={list.data?.rows ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={(row) => {
            setEditing(row);
            setModalOpen(true);
          }}
          onNew={openNew}
          showNew
          codeKey="booking_no"
          nameKey="title"
          sortKey={sort()}
          sortOrder={order()}
          onSort={toggleSort}
          page={page()}
          pageSize={pageSize}
          total={list.data?.total ?? 0}
          onPageChange={setPage}
          search={q()}
          onSearchChange={setQ}
          searchPlaceholder="Search bookings…"
        />
      </Show>

      <Show when={setupTab() === "resources"}>
        <SetupResourcesList rows={resources() ?? []} onSaved={() => void refetchResources()} />
      </Show>
      <Show when={setupTab() === "services"}>
        <SetupServicesList rows={services() ?? []} onSaved={() => void refetchServices()} />
      </Show>

      <BookingModal
        open={modalOpen()}
        initial={editing()}
        resources={resources() ?? []}
        services={services() ?? []}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          invalidate();
        }}
      />
    </div>
  );
}

function SetupResourcesList(props: { rows: Resource[]; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");
  const save = async () => {
    const res = await apiFetch("/api/v1/booking/resources", {
      method: "POST",
      body: JSON.stringify({ code: code(), name: name(), resource_type: "staff", is_active: true }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed");
      return;
    }
    setCode("");
    setName("");
    props.onSaved();
  };
  return (
    <div class="space-y-4 rounded-xl border border-stroke bg-white p-4">
      <div class="grid gap-3 md:grid-cols-3">
        <Field label="Code">
          <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
        </Field>
        <Field label="Name">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <div class="flex items-end">
          <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white" onClick={() => void save()}>
            Add resource
          </button>
        </div>
      </div>
      <ul class="divide-y text-sm">
        <For each={props.rows}>{(r) => <li class="py-2">{r.code} — {r.name}</li>}</For>
      </ul>
    </div>
  );
}

function SetupServicesList(props: { rows: Service[]; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [mins, setMins] = createSignal(60);
  const [price, setPrice] = createSignal(0);
  const save = async () => {
    const res = await apiFetch("/api/v1/booking/services", {
      method: "POST",
      body: JSON.stringify({
        code: code(),
        name: name(),
        duration_minutes: mins(),
        unit_price: price(),
        is_active: true,
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed");
      return;
    }
    setCode("");
    setName("");
    props.onSaved();
  };
  return (
    <div class="space-y-4 rounded-xl border border-stroke bg-white p-4">
      <div class="grid gap-3 md:grid-cols-4">
        <Field label="Code">
          <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
        </Field>
        <Field label="Name">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Field label="Minutes">
          <input type="number" class={inputClass} value={mins()} onInput={(e) => setMins(Number(e.currentTarget.value) || 60)} />
        </Field>
        <Field label="Unit price">
          <input type="number" class={inputClass} value={price()} onInput={(e) => setPrice(Number(e.currentTarget.value) || 0)} />
        </Field>
      </div>
      <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white" onClick={() => void save()}>
        Add service
      </button>
      <ul class="divide-y text-sm">
        <For each={props.rows}>
          {(r) => (
            <li class="py-2">
              {r.code} — {r.name} ({r.duration_minutes}m / {r.unit_price})
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

function BookingModal(props: {
  open: boolean;
  initial: Booking | null;
  resources: Resource[];
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = createSignal("");
  const [starts, setStarts] = createSignal("");
  const [ends, setEnds] = createSignal("");
  const [status, setStatus] = createSignal("scheduled");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [resourceId, setResourceId] = createSignal<number | null>(null);
  const [serviceId, setServiceId] = createSignal<number | null>(null);
  const [notes, setNotes] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const init = props.initial;
    if (init) {
      setTitle(init.title);
      setStarts(toLocalInput(init.starts_at));
      setEnds(toLocalInput(init.ends_at));
      setStatus(init.status);
      setPartnerId(init.partner_id ?? null);
      setPartnerLabel(init.partner_name ?? "");
      setResourceId(init.resource_id ?? null);
      setServiceId(init.service_id ?? null);
      setNotes(init.notes ?? "");
    } else {
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000);
      setTitle("");
      setStarts(toLocalInput(now.toISOString()));
      setEnds(toLocalInput(end.toISOString()));
      setStatus("scheduled");
      setPartnerId(null);
      setPartnerLabel("");
      setResourceId(null);
      setServiceId(null);
      setNotes("");
    }
  });

  const save = async () => {
    if (!title().trim() || !starts() || !ends()) {
      toast.warning("Title and schedule are required.");
      return;
    }
    setBusy(true);
    const body = {
      title: title().trim(),
      starts_at: fromLocalInput(starts()),
      ends_at: fromLocalInput(ends()),
      status: status(),
      partner_id: partnerId(),
      resource_id: resourceId(),
      service_id: serviceId(),
      notes: notes(),
    };
    const res = props.initial
      ? await apiFetch(`/api/v1/booking/bookings/${props.initial.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await apiFetch("/api/v1/booking/bookings", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Save failed.");
      return;
    }
    props.onSaved();
  };

  return (
    <Modal open={props.open} title={props.initial ? "Edit booking" : "New booking"} onClose={props.onClose}>
      <div class="space-y-3">
        <Field label="Title">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <div class="grid gap-3 md:grid-cols-2">
          <Field label="Starts">
            <input type="datetime-local" class={inputClass} value={starts()} onInput={(e) => setStarts(e.currentTarget.value)} />
          </Field>
          <Field label="Ends">
            <input type="datetime-local" class={inputClass} value={ends()} onInput={(e) => setEnds(e.currentTarget.value)} />
          </Field>
        </div>
        <Field label="Status">
          <select class={inputClass} value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
            <For each={STATUSES}>{(s) => <option value={s}>{s}</option>}</For>
          </select>
        </Field>
        <LookupCombo
          label="Customer"
          value={() => partnerLabel()}
          selectedId={() => partnerId()}
          onInput={setPartnerLabel}
          onSelect={(o) => {
            setPartnerLabel(o.label);
            setPartnerId(o.id);
          }}
          onClear={() => {
            setPartnerLabel("");
            setPartnerId(null);
          }}
          fetchOptions={async (q) => {
            const res = await apiFetch<{ id: number; company_name: string }[]>(
              `/api/v1/inventory/partners?page=1&pageSize=20&q=${encodeURIComponent(q)}`,
            );
            return (res.data ?? []).map((p) => ({ id: p.id, label: p.company_name }));
          }}
        />
        <Field label="Resource">
          <select
            class={inputClass}
            value={resourceId() ?? ""}
            onChange={(e) => setResourceId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
          >
            <option value="">—</option>
            <For each={props.resources}>{(r) => <option value={r.id}>{r.name}</option>}</For>
          </select>
        </Field>
        <Field label="Service">
          <select
            class={inputClass}
            value={serviceId() ?? ""}
            onChange={(e) => setServiceId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
          >
            <option value="">—</option>
            <For each={props.services}>{(s) => <option value={s.id}>{s.name}</option>}</For>
          </select>
        </Field>
        <Field label="Notes">
          <textarea class={inputClass} rows={3} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy()}
            onClick={() => void save()}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
