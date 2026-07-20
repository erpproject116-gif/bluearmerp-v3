import { createMemo, createSignal, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { KanbanBoard } from "../../../shared/KanbanBoard";
import { KanbanCard, type KanbanDetailRow } from "../../../shared/KanbanCard";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../../shared/ViewModeToggle";
import { useToast } from "../../../shared/toast";
import { apiFetch } from "../../../shared/api";
import { AcctIILayout } from "./AcctIILayout";

const BOARD_STORAGE_KEY = "finance-contracts-view";

const MILESTONE_STAGES = [
  { id: "pending", label: "Pending" },
  { id: "billed", label: "Billed" },
  { id: "collected", label: "Collected" },
] as const;

type Contract = {
  id: number;
  contract_no: string;
  partner_id: number;
  title: string;
  start_date: string;
  end_date?: string | null;
  total_amount: number;
  status: string;
  inv_project_id?: number | null;
  job_cost_project_id?: number | null;
};

type ContractMilestone = {
  id: number;
  contract_id: number;
  contract_no: string;
  contract_title: string;
  partner_id: number;
  partner_name: string;
  milestone_no: number;
  description: string;
  due_date?: string | null;
  amount: number;
  billed_sale_id?: number | null;
  sales_no?: string;
  status: string;
  billing_status: string;
  inv_project_id?: number | null;
  job_cost_project_id?: number | null;
};

type Partner = {
  id: number;
  partner_code: string;
  company_name: string;
};

type InvProject = {
  id: number;
  project_code: string;
  project_name: string;
};

type JobCostProject = {
  id: number;
  project_code: string;
  project_name: string;
};

function milestoneCardDetails(m: ContractMilestone): KanbanDetailRow[] {
  const rows: KanbanDetailRow[] = [
    { label: "Contract", value: `${m.contract_no} — ${m.contract_title}` },
    { label: "Customer", value: m.partner_name },
    { label: "Due", value: m.due_date ?? "—" },
    { label: "Amount", value: m.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) },
  ];
  if (m.sales_no) rows.push({ label: "Sales invoice", value: m.sales_no });
  if (m.inv_project_id) rows.push({ label: "Inv. project", value: `#${m.inv_project_id}` });
  if (m.job_cost_project_id) rows.push({ label: "Job cost project", value: `#${m.job_cost_project_id}` });
  return rows;
}

export default function ContractsPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [viewMode, setViewMode] = createSignal<ViewMode>(loadViewMode(BOARD_STORAGE_KEY, "board"));
  const [modalOpen, setModalOpen] = createSignal(false);
  const [milestoneModalOpen, setMilestoneModalOpen] = createSignal(false);
  const [contractNo, setContractNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [startDate, setStartDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = createSignal("");
  const [totalAmount, setTotalAmount] = createSignal("");
  const [invProjectId, setInvProjectId] = createSignal("");
  const [jobCostProjectId, setJobCostProjectId] = createSignal("");
  const [milestoneDesc, setMilestoneDesc] = createSignal("");
  const [milestoneDue, setMilestoneDue] = createSignal("");
  const [milestoneAmount, setMilestoneAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["finance-contracts"],
    queryFn: async () => {
      const res = await apiFetch<Contract[]>("/api/v1/finance/contracts");
      if (!res.success) throw new Error(res.message ?? "Failed to load contracts");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const milestones = createQuery(() => ({
    queryKey: ["finance-contract-milestones", selectedId()],
    queryFn: async () => {
      const cid = selectedId();
      const path = cid
        ? `/api/v1/finance/contracts/milestones/board?contract_id=${cid}`
        : "/api/v1/finance/contracts/milestones/board";
      const res = await apiFetch<ContractMilestone[]>(path);
      if (!res.success) throw new Error(res.message ?? "Failed to load milestones");
      return res.data ?? [];
    },
  }));

  const partners = createQuery(() => ({
    queryKey: ["partners-mini-contracts"],
    queryFn: async () => {
      const res = await apiFetch<Partner[]>("/api/v1/inventory/partners?page=1&pageSize=200&sort=company_name&order=asc");
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const invProjects = createQuery(() => ({
    queryKey: ["inv-projects-contracts"],
    queryFn: async () => {
      const res = await apiFetch<InvProject[]>("/api/v1/inventory/projects?page=1&pageSize=200");
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const jobCostProjects = createQuery(() => ({
    queryKey: ["job-cost-projects-contracts"],
    queryFn: async () => {
      const res = await apiFetch<JobCostProject[]>("/api/v1/job-costing/projects");
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const partnerName = (id: number) => {
    const p = (partners.data ?? []).find((x) => x.id === id);
    return p ? `${p.partner_code} — ${p.company_name}` : `#${id}`;
  };

  const boardColumns = createMemo(() =>
    MILESTONE_STAGES.map((s) => ({
      id: s.id,
      label: s.label,
      items: (milestones.data ?? []).filter((m) => m.billing_status === s.id),
    })),
  );

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["finance-contracts"] });
    void client.invalidateQueries({ queryKey: ["finance-contract-milestones"] });
  };

  const openNew = () => {
    setContractNo("");
    setPartnerId("");
    setTitle("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setTotalAmount("");
    setInvProjectId("");
    setJobCostProjectId("");
    setModalOpen(true);
  };

  const openMilestone = () => {
    if (!selectedId()) {
      toast.warning("Select a contract first.");
      return;
    }
    setMilestoneDesc("");
    setMilestoneDue("");
    setMilestoneAmount("");
    setMilestoneModalOpen(true);
  };

  const save = async () => {
    const pid = Number(partnerId());
    if (!contractNo().trim() || !title().trim() || !pid) {
      toast.warning("Contract number, title, and partner are required.");
      return;
    }
    setSaving(true);
    const invPid = invProjectId() ? Number(invProjectId()) : null;
    const jcPid = jobCostProjectId() ? Number(jobCostProjectId()) : null;
    const res = await apiFetch<Contract>("/api/v1/finance/contracts", {
      method: "POST",
      body: JSON.stringify({
        contract_no: contractNo().trim(),
        partner_id: pid,
        title: title().trim(),
        start_date: startDate(),
        end_date: endDate().trim() || null,
        total_amount: Number(totalAmount()) || 0,
        status: "active",
        inv_project_id: invPid,
        job_cost_project_id: jcPid,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create contract.");
      return;
    }
    toast.success("Contract created.");
    setModalOpen(false);
    invalidate();
  };

  const saveMilestone = async () => {
    const cid = selectedId();
    if (!cid) return;
    if (!milestoneDesc().trim() || !Number(milestoneAmount())) {
      toast.warning("Description and amount are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<ContractMilestone>(`/api/v1/finance/contracts/${cid}/milestones`, {
      method: "POST",
      body: JSON.stringify({
        description: milestoneDesc().trim(),
        due_date: milestoneDue().trim() || null,
        amount: Number(milestoneAmount()),
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create milestone.");
      return;
    }
    toast.success("Milestone added.");
    setMilestoneModalOpen(false);
    invalidate();
  };

  return (
    <AcctIILayout>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Contracts & milestone billing</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Track contract milestones from pending billing through collection. Due milestones are invoiced daily by the tenant billing job.
        </p>
      </section>

      <div class="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3">
        <ViewModeToggle value={viewMode()} onChange={setViewMode} storageKey={BOARD_STORAGE_KEY} />
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium text-text-primary hover:bg-slate-50"
            onClick={() => openMilestone()}
          >
            + Milestone
          </button>
        </div>
      </div>

      <SpreadsheetGrid<Contract>
        columns={[
          { key: "contract_no", header: "Contract #", clickable: true },
          { key: "title", header: "Title" },
          {
            key: "partner_id",
            header: "Partner",
            render: (r) => partnerName(r.partner_id),
          },
          { key: "start_date", header: "Start" },
          { key: "end_date", header: "End" },
          {
            key: "total_amount",
            header: "Total",
            render: (r) => r.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => <span class="capitalize">{r.status}</span>,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        codeKey="contract_no"
        nameKey="title"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
        exportFilename="contracts"
        exportTitle="Contracts"
      />

      <Show when={viewMode() === "board"}>
        <section class="mt-6">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-text-primary">
              Milestone board
              <Show when={selectedId()}>
                <span class="ml-2 font-normal text-text-secondary">(selected contract)</span>
              </Show>
            </h3>
            <Show when={!selectedId()}>
              <span class="text-xs text-text-secondary">Select a contract to filter, or view all milestones.</span>
            </Show>
          </div>
          <KanbanBoard
            columns={boardColumns()}
            getCardId={(m) => m.id}
            onDrop={() => {}}
            loading={milestones.isFetching}
            renderCard={(m) => (
              <KanbanCard
                title={`#${m.milestone_no} — ${m.description}`}
                subtitle={m.contract_no}
                badge={m.billing_status}
                details={milestoneCardDetails(m)}
                severity={m.billing_status === "pending" ? "warning" : m.billing_status === "collected" ? undefined : "info"}
                onClick={
                  m.billed_sale_id
                    ? () => {
                        window.location.href = `/app/sales/sales/${m.billed_sale_id}`;
                      }
                    : undefined
                }
              />
            )}
          />
        </section>
      </Show>

      <EntityModal
        open={modalOpen()}
        title="New contract"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Contract number *">
          <input class={inputClass} value={contractNo()} onInput={(e) => setContractNo(e.currentTarget.value)} />
        </Field>
        <Field label="Title *">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Partner *">
          <select class={inputClass} value={partnerId()} onChange={(e) => setPartnerId(e.currentTarget.value)}>
            <option value="">Select partner…</option>
            {(partners.data ?? []).map((p) => (
              <option value={String(p.id)}>
                {p.partner_code} — {p.company_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Inventory project">
          <select class={inputClass} value={invProjectId()} onChange={(e) => setInvProjectId(e.currentTarget.value)}>
            <option value="">None</option>
            {(invProjects.data ?? []).map((p) => (
              <option value={String(p.id)}>
                {p.project_code} — {p.project_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Job cost project">
          <select class={inputClass} value={jobCostProjectId()} onChange={(e) => setJobCostProjectId(e.currentTarget.value)}>
            <option value="">None</option>
            {(jobCostProjects.data ?? []).map((p) => (
              <option value={String(p.id)}>
                {p.project_code} — {p.project_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input class={inputClass} type="date" value={startDate()} onInput={(e) => setStartDate(e.currentTarget.value)} />
        </Field>
        <Field label="End date">
          <input class={inputClass} type="date" value={endDate()} onInput={(e) => setEndDate(e.currentTarget.value)} />
        </Field>
        <Field label="Total contract value">
          <input class={inputClass} type="number" min="0" step="0.01" value={totalAmount()} onInput={(e) => setTotalAmount(e.currentTarget.value)} />
        </Field>
      </EntityModal>

      <EntityModal
        open={milestoneModalOpen()}
        title="New milestone"
        onClose={() => setMilestoneModalOpen(false)}
        onSave={() => void saveMilestone()}
        saving={saving()}
        singleColumn
      >
        <Field label="Description *">
          <input class={inputClass} value={milestoneDesc()} onInput={(e) => setMilestoneDesc(e.currentTarget.value)} />
        </Field>
        <Field label="Due date">
          <input class={inputClass} type="date" value={milestoneDue()} onInput={(e) => setMilestoneDue(e.currentTarget.value)} />
        </Field>
        <Field label="Billing amount *">
          <input class={inputClass} type="number" min="0" step="0.01" value={milestoneAmount()} onInput={(e) => setMilestoneAmount(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </AcctIILayout>
  );
}
