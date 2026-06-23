import { createSignal, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass, SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { AfterSalesLayout } from "./AfterSalesLayout";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type StatusRow = {
  id: number;
  registration_date: string;
  date_no_display: string;
  registration_no: string;
  partner_name: string;
  item_code: string;
  item_name: string;
  serial_no?: string | null;
  issue_description?: string | null;
  status: string;
  repair_order_no?: string | null;
};

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "customer" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name }));
}

export default function RegisterRepairStatusPage() {
  const [dateFrom, setDateFrom] = createSignal(monthStartISO());
  const [dateTo, setDateTo] = createSignal(todayISO());
  const [status, setStatus] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [submitted, setSubmitted] = createSignal<{ date_from: string; date_to: string; status: string; partner_id?: number } | null>(null);
  const [page, setPage] = createSignal(1);
  const pageSize = 50;

  const report = createQuery(() => ({
    queryKey: ["repair-registration-status", submitted(), page()],
    enabled: submitted() !== null,
    queryFn: async () => {
      const f = submitted()!;
      const qs = new URLSearchParams({
        date_from: f.date_from,
        date_to: f.date_to,
        page: String(page()),
        pageSize: String(pageSize),
        sort: "registration_date",
        order: "desc",
      });
      if (f.status) qs.set("status", f.status);
      if (f.partner_id) qs.set("partner_id", String(f.partner_id));
      const res = await apiFetch<StatusRow[]>(`/api/v1/inventory/repair-registrations/status-report?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load report");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  }));

  const search = () => {
    setSubmitted({
      date_from: dateFrom(),
      date_to: dateTo(),
      status: status(),
      partner_id: partnerId() ?? undefined,
    });
    setPage(1);
  };

  return (
    <AfterSalesLayout>
      <div class="mb-4 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <p class="mb-3 text-sm font-medium text-text-primary">Filter (F8 Search)</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From *">
            <DateInput value={dateFrom()} onInput={(e) => setDateFrom(e.currentTarget.value)} />
          </Field>
          <Field label="To *">
            <DateInput value={dateTo()} onInput={(e) => setDateTo(e.currentTarget.value)} />
          </Field>
          <Field label="Status">
            <select class={inputClass} value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="converted">Converted</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
          <LookupCombo
            label="Customer"
            value={partnerLabel}
            selectedId={partnerId}
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
        </div>
        <div class="mt-3 flex gap-2">
          <button type="button" class="rounded-lg bg-brand px-4 py-2 text-sm text-white" onClick={search}>
            Search (F8)
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm"
            onClick={() => {
              setDateFrom(monthStartISO());
              setDateTo(todayISO());
              setStatus("");
              setPartnerId(null);
              setPartnerLabel("");
              setSubmitted(null);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <Show when={submitted()}>
        <SpreadsheetGrid
          columns={[
            { key: "date_no_display", header: "Date-no" },
            { key: "registration_no", header: "Registration No." },
            { key: "partner_name", header: "Customer" },
            { key: "item_code", header: "Item Code" },
            { key: "item_name", header: "Item Name" },
            { key: "serial_no", header: "Serial No." },
            {
              key: "issue_description",
              header: "Issue",
              render: (r) => (r.issue_description ? String(r.issue_description).slice(0, 60) : ""),
            },
            { key: "status", header: "Status" },
            { key: "repair_order_no", header: "Repair Order" },
          ]}
          rows={report.data?.rows ?? []}
          loading={report.isFetching}
          selectedId={null}
          onSelect={() => {}}
          onEdit={() => {}}
          onNew={() => {}}
          codeKey="registration_no"
          nameKey="date_no_display"
          page={page()}
          pageSize={pageSize}
          total={report.data?.total ?? 0}
          onPageChange={setPage}
        />
      </Show>
    </AfterSalesLayout>
  );
}
