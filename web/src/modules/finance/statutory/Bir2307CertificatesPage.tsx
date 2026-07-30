import { createSignal, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { A, useNavigate } from "@solidjs/router";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { formatMoney } from "../../../shared/money";
import { fetchPartnerOptions } from "../../../shared/useDocumentLookups";
import { ModalLookupField } from "../../../shared/ModalLookupField";

type Certificate = {
  id: number;
  payee_partner_id: number;
  payee_name: string;
  period_from: string;
  period_to: string;
  certificate_no: string;
  status: string;
  total_base: number;
  total_tax: number;
  issued_at?: string | null;
};

export default function Bir2307CertificatesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [payeeId, setPayeeId] = createSignal<number | null>(null);
  const [payeeLabel, setPayeeLabel] = createSignal("");
  const [periodFrom, setPeriodFrom] = createSignal("");
  const [periodTo, setPeriodTo] = createSignal("");
  const [certificateNo, setCertificateNo] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["bir-2307-certificates"],
    queryFn: async () => {
      const res = await apiFetch<Certificate[]>("/api/v1/finance/statutory/2307-certificates");
      if (!res.success) throw new Error(res.message ?? "Failed to load certificates");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["bir-2307-certificates"] });

  const openNew = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setPayeeId(null);
    setPayeeLabel("");
    setPeriodFrom(start.toISOString().slice(0, 10));
    setPeriodTo(now.toISOString().slice(0, 10));
    setCertificateNo("");
    setModalOpen(true);
  };

  const save = async () => {
    if (!payeeId()) {
      toast.warning("Select a payee vendor.");
      return;
    }
    if (!periodFrom() || !periodTo()) {
      toast.warning("Period from and to are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<Certificate>("/api/v1/finance/statutory/2307-certificates", {
      method: "POST",
      body: JSON.stringify({
        payee_partner_id: payeeId(),
        period_from: periodFrom(),
        period_to: periodTo(),
        certificate_no: certificateNo().trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create certificate.");
      return;
    }
    toast.success("Draft certificate created.");
    setModalOpen(false);
    invalidate();
  };

  const issue = async (row: Certificate) => {
    setBusyId(row.id);
    const res = await apiFetch<Certificate>(`/api/v1/finance/statutory/2307-certificates/${row.id}/issue`, { method: "POST" });
    setBusyId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to issue.");
      return;
    }
    toast.success("Certificate issued.");
    invalidate();
  };

  const voidCert = async (row: Certificate) => {
    if (!window.confirm(`Void certificate ${row.certificate_no}?`)) return;
    setBusyId(row.id);
    const res = await apiFetch<Certificate>(`/api/v1/finance/statutory/2307-certificates/${row.id}/void`, { method: "POST" });
    setBusyId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to void.");
      return;
    }
    toast.success("Certificate voided.");
    invalidate();
  };

  return (
    <div class="space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>2307 certificates</span>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">BIR Form 2307 certificates</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Aggregate open withholding lines by payee and period. For accountant review — not a BIR e-filing submission.
        </p>
      </section>
      <SpreadsheetGrid<Certificate>
        columns={[
          { key: "certificate_no", header: "Certificate no.", clickable: true },
          { key: "payee_name", header: "Payee" },
          { key: "period_from", header: "From" },
          { key: "period_to", header: "To" },
          { key: "status", header: "Status" },
          {
            key: "total_tax",
            header: "Tax withheld",
            render: (r) => formatMoney(r.total_tax),
          },
          {
            key: "id",
            header: "Actions",
            render: (r) => (
              <div class="flex flex-wrap gap-2">
                <Show when={r.status === "draft"}>
                  <button type="button" class="text-xs text-brand-600" disabled={busyId() === r.id} onClick={() => void issue(r)}>
                    Issue
                  </button>
                </Show>
                <Show when={r.status !== "void"}>
                  <button type="button" class="text-xs text-brand-600" onClick={() => navigate(`/app/finance/statutory/2307-certificates/${r.id}/print`)}>
                    Print
                  </button>
                </Show>
                <Show when={r.status !== "void"}>
                  <button type="button" class="text-xs text-red-600" disabled={busyId() === r.id} onClick={() => void voidCert(r)}>
                    Void
                  </button>
                </Show>
              </div>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        codeKey="certificate_no"
        nameKey="payee_name"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
        exportFilename="2307-certificates"
        exportTitle="2307 Certificates"
      />
      <EntityModal open={modalOpen()} title="New 2307 certificate" onClose={() => setModalOpen(false)} onSave={() => void save()} saving={saving()} singleColumn>
        <ModalLookupField
          label="Payee (vendor) *"
          value={payeeId()}
          displayValue={payeeLabel()}
          onChange={(id, label) => {
            setPayeeId(id);
            setPayeeLabel(label);
          }}
          fetchOptions={(q) => fetchPartnerOptions(q, "vendor")}
        />
        <Field label="Period from *">
          <input class={inputClass} type="date" value={periodFrom()} onInput={(e) => setPeriodFrom(e.currentTarget.value)} />
        </Field>
        <Field label="Period to *">
          <input class={inputClass} type="date" value={periodTo()} onInput={(e) => setPeriodTo(e.currentTarget.value)} />
        </Field>
        <Field label="Certificate no. (optional)">
          <input class={inputClass} value={certificateNo()} onInput={(e) => setCertificateNo(e.currentTarget.value)} placeholder="Auto-generated if blank" />
        </Field>
      </EntityModal>
    </div>
  );
}
