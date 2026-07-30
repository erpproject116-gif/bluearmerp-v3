import { createSignal, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";

type TaxpayerProfile = {
  rdo_code?: string | null;
  tax_regime?: string | null;
  registration_date?: string | null;
  line_of_business?: string | null;
  cor_file_url?: string | null;
};

export default function TaxpayerProfilePage() {
  const toast = useToast();
  const client = useQueryClient();
  const [rdoCode, setRdoCode] = createSignal("");
  const [taxRegime, setTaxRegime] = createSignal("");
  const [registrationDate, setRegistrationDate] = createSignal("");
  const [lineOfBusiness, setLineOfBusiness] = createSignal("");
  const [corFileUrl, setCorFileUrl] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const profile = createQuery(() => ({
    queryKey: ["statutory-taxpayer-profile"],
    queryFn: async () => {
      const res = await apiFetch<TaxpayerProfile>("/api/v1/finance/statutory/taxpayer-profile");
      if (!res.success) throw new Error(res.message ?? "Failed to load profile");
      const d = res.data!;
      setRdoCode(d.rdo_code ?? "");
      setTaxRegime(d.tax_regime ?? "");
      setRegistrationDate(d.registration_date ?? "");
      setLineOfBusiness(d.line_of_business ?? "");
      setCorFileUrl(d.cor_file_url ?? "");
      return d;
    },
  }));

  const save = async () => {
    setSaving(true);
    const res = await apiFetch<TaxpayerProfile>("/api/v1/finance/statutory/taxpayer-profile", {
      method: "PATCH",
      body: JSON.stringify({
        rdo_code: rdoCode().trim() || null,
        tax_regime: taxRegime().trim() || null,
        registration_date: registrationDate().trim() || null,
        line_of_business: lineOfBusiness().trim() || null,
        cor_file_url: corFileUrl().trim() || null,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save.");
      return;
    }
    toast.success("Taxpayer profile saved.");
    void client.invalidateQueries({ queryKey: ["statutory-taxpayer-profile"] });
  };

  return (
    <div class="mx-auto max-w-xl space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>Taxpayer profile</span>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Taxpayer profile</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Tenant-level BIR registration details. Company TIN for 2307 payor prints is configured under{" "}
          <A href="/app/settings/branding" class="text-brand-600 hover:underline">
            Branding settings
          </A>
          .
        </p>
        <Show when={!profile.isLoading} fallback={<p class="mt-4 text-sm text-text-secondary">Loading…</p>}>
          <div class="mt-4 space-y-3">
            <Field label="RDO code">
              <input class={inputClass} value={rdoCode()} onInput={(e) => setRdoCode(e.currentTarget.value)} />
            </Field>
            <Field label="Tax regime">
              <select class={inputClass} value={taxRegime()} onChange={(e) => setTaxRegime(e.currentTarget.value)}>
                <option value="">—</option>
                <option value="vat">VAT</option>
                <option value="non_vat">Non-VAT</option>
                <option value="percentage">Percentage tax</option>
              </select>
            </Field>
            <Field label="Registration date">
              <input class={inputClass} type="date" value={registrationDate()} onInput={(e) => setRegistrationDate(e.currentTarget.value)} />
            </Field>
            <Field label="Line of business">
              <input class={inputClass} value={lineOfBusiness()} onInput={(e) => setLineOfBusiness(e.currentTarget.value)} />
            </Field>
            <Field label="COR file URL">
              <input class={inputClass} value={corFileUrl()} onInput={(e) => setCorFileUrl(e.currentTarget.value)} placeholder="https://…" />
            </Field>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={saving()}
              onClick={() => void save()}
            >
              {saving() ? "Saving…" : "Save profile"}
            </button>
          </div>
        </Show>
      </section>
    </div>
  );
}
