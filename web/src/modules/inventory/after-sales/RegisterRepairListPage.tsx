import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { useListState } from "../../../shared/useListState";
import { useToast } from "../../../shared/toast";
import { AfterSalesLayout } from "./AfterSalesLayout";

export type RepairRegistrationRow = {
  id: number;
  registration_date: string;
  date_no_display: string;
  registration_no: string;
  partner_name?: string;
  item_code: string;
  item_name: string;
  serial_no?: string | null;
  status: string;
  repair_order_no?: string | null;
};

function useRepairRegistrationList(params: () => Record<string, string | number | undefined>) {
  return createQuery(() => ({
    queryKey: ["repair-registrations", params()],
    queryFn: async () => {
      const p = params();
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(p)) {
        if (v != null && v !== "") qs.set(k, String(v));
      }
      const res = await apiFetch<RepairRegistrationRow[]>(`/api/v1/inventory/repair-registrations?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  }));
}

export default function RegisterRepairListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } = useListState(
    "registration_date",
    25,
    { defaultOrder: "desc" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [convertingId, setConvertingId] = createSignal<number | null>(null);

  const list = useRepairRegistrationList(() => ({
    page: page(),
    pageSize: pageSize(),
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["repair-registrations"] });

  const convertToOrder = async (row: RepairRegistrationRow) => {
    if (row.status === "converted") {
      toast.warning("Already converted.");
      return;
    }
    setConvertingId(row.id);
    const res = await apiFetch(`/api/v1/inventory/repair-registrations/${row.id}/convert-to-repair-order`, {
      method: "POST",
      body: JSON.stringify({ pic_name: "" }),
    }, { successMessage: "Converted to repair order." });
    setConvertingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Conversion failed.");
      return;
    }
    invalidate();
  };

  return (
    <AfterSalesLayout>
      <SpreadsheetGrid
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "registration_no", header: "Registration No.", clickable: true },
          { key: "partner_name", header: "Customer" },
          { key: "item_code", header: "Item Code" },
          { key: "item_name", header: "Item Name" },
          { key: "serial_no", header: "Serial No." },
          { key: "status", header: "Status" },
          { key: "repair_order_no", header: "Repair Order" },
          {
            key: "convert",
            header: "Convert",
            sortable: false,
            render: (r) =>
              r.status !== "converted" ? (
                <button
                  type="button"
                  class="text-brand-600 hover:underline disabled:opacity-50"
                  disabled={convertingId() === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void convertToOrder(r);
                  }}
                >
                  {convertingId() === r.id ? "…" : "→ RO"}
                </button>
              ) : null,
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="after-sales" targetType="inv_repair_registration" targetId={r.id} title={`History — ${r.registration_no}`} />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => navigate(`/app/after-sales/register-repair/new?id=${row.id}`)}
        onNew={() => navigate("/app/after-sales/register-repair/new")}
        codeKey="registration_no"
        nameKey="date_no_display"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search registration, customer, item, serial…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "open", label: "Open" },
          { value: "converted", label: "Converted" },
          { value: "closed", label: "Closed" },
          { value: "", label: "All" },
        ]}
        onRefresh={invalidate}
      />
    </AfterSalesLayout>
  );
}
