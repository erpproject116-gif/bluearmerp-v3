import { createMemo, createSignal, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { FINANCE_SETTINGS_HREF } from "../../../shared/entityTypes";
import { FinanceLayout } from "../FinanceLayout";

type ApRow = {
  partner_id: number;
  vendor_name: string;
  total_billed: number;
  total_paid: number;
  balance: number;
};

type ApGridRow = ApRow & { id: number };

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ApByVendorPage() {
  const [searched, setSearched] = createSignal(false);

  const report = createQuery(() => ({
    queryKey: ["ap-by-vendor"],
    enabled: searched(),
    queryFn: async () => {
      const res = await apiFetch<ApRow[]>("/api/v1/finance/ap-by-vendor?page=1&pageSize=100&sort=vendor_name&order=asc");
      if (!res.success) throw new Error(res.message ?? "Failed");
      return res.data ?? [];
    },
  }));

  const rows = createMemo<ApGridRow[]>(() =>
    (report.data ?? []).map((r) => ({ ...r, id: r.partner_id })),
  );

  return (
    <FinanceLayout>
      <div class="mb-4 flex gap-2">
        <button type="button" class="rounded bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => setSearched(true)}>
          Run report (F8)
        </button>
      </div>
      <Show when={searched()}>
        <SpreadsheetGrid<ApGridRow>
          columns={[
            { key: "vendor_name", header: "Vendor" },
            { key: "total_billed", header: "Total billed", render: (r) => money(r.total_billed) },
            { key: "total_paid", header: "Total paid", render: (r) => money(r.total_paid) },
            { key: "balance", header: "Balance", render: (r) => money(r.balance) },
          ]}
          rows={rows()}
          loading={report.isFetching}
          selectedId={null}
          onSelect={() => {}}
          onEdit={() => {}}
          onNew={() => setSearched(true)}
          codeKey="vendor_name"
          nameKey="vendor_name"
          total={rows().length}
          page={1}
          pageSize={100}
          onPageChange={() => {}}
          settingsHref={FINANCE_SETTINGS_HREF.officialReceipt}
        />
      </Show>
    </FinanceLayout>
  );
}
