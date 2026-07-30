import { createSignal, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";

type AttachmentVault = {
  cor_file_url?: string | null;
  cas_file_url?: string | null;
  atp_file_url?: string | null;
};

export default function StatutoryAttachmentsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [corUrl, setCorUrl] = createSignal("");
  const [casUrl, setCasUrl] = createSignal("");
  const [atpUrl, setAtpUrl] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const vault = createQuery(() => ({
    queryKey: ["statutory-attachments"],
    queryFn: async () => {
      const res = await apiFetch<AttachmentVault>("/api/v1/finance/statutory/attachments");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      const d = res.data!;
      setCorUrl(d.cor_file_url ?? "");
      setCasUrl(d.cas_file_url ?? "");
      setAtpUrl(d.atp_file_url ?? "");
      return d;
    },
  }));

  const save = async () => {
    setSaving(true);
    const res = await apiFetch<AttachmentVault>("/api/v1/finance/statutory/attachments", {
      method: "PATCH",
      body: JSON.stringify({
        cor_file_url: corUrl().trim() || null,
        cas_file_url: casUrl().trim() || null,
        atp_file_url: atpUrl().trim() || null,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save.");
      return;
    }
    toast.success("Attachment links saved.");
    void client.invalidateQueries({ queryKey: ["statutory-attachments"] });
  };

  return (
    <div class="mx-auto max-w-xl space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>Registration attachments</span>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">COR / CAS / ATP vault</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Store links to scanned registration documents (cloud drive, SharePoint, etc.). Full attachment platform integration can replace these URLs later.
        </p>
        <Show when={!vault.isLoading} fallback={<p class="mt-4 text-sm text-text-secondary">Loading…</p>}>
          <div class="mt-4 space-y-3">
            <Field label="Certificate of Registration (COR) URL">
              <input class={inputClass} value={corUrl()} onInput={(e) => setCorUrl(e.currentTarget.value)} placeholder="https://…" />
            </Field>
            <Field label="CAS registration URL">
              <input class={inputClass} value={casUrl()} onInput={(e) => setCasUrl(e.currentTarget.value)} placeholder="https://…" />
            </Field>
            <Field label="Authority to Print (ATP) URL">
              <input class={inputClass} value={atpUrl()} onInput={(e) => setAtpUrl(e.currentTarget.value)} placeholder="https://…" />
            </Field>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={saving()}
              onClick={() => void save()}
            >
              {saving() ? "Saving…" : "Save links"}
            </button>
          </div>
        </Show>
      </section>
    </div>
  );
}
