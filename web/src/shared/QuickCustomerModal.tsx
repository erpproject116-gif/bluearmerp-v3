import { createEffect, createSignal, Show } from "solid-js";
import { Modal } from "./Modal";
import { Field, inputClass } from "./SpreadsheetGrid";
import { apiFetch } from "./api";
import { useToast } from "./toast";

type CreatedPartner = { id: number; company_name: string };

type Props = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (partner: CreatedPartner) => void;
};

/**
 * Lightweight "create customer" dialog for use inside document modals (Sales,
 * Sales Order, Quotation, POS). Creates a minimal partner (kind = customer) via
 * the standard partner endpoint and hands the new record back to the caller so it
 * can be selected immediately. Full editing lives in the Partners page.
 */
export function QuickCustomerModal(props: Props) {
  const toast = useToast();
  const [companyName, setCompanyName] = createSignal("");
  const [mobile, setMobile] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [tin, setTin] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  // Reset the form whenever the dialog opens, prefilling the name the user typed.
  createEffect(() => {
    if (props.open) {
      setCompanyName(props.initialName ?? "");
      setMobile("");
      setPhone("");
      setEmail("");
      setTin("");
      setAddress("");
      setError("");
      setSaving(false);
    }
  });

  const save = async () => {
    const name = companyName().trim();
    if (!name) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<CreatedPartner>("/api/v1/inventory/partners", {
      method: "POST",
      body: JSON.stringify({
        partner_kind: "customer",
        status: "active",
        company_name: name,
        mobile: mobile().trim() || null,
        phone: phone().trim() || null,
        email: email().trim() || null,
        tin: tin().trim() || null,
        address: address().trim() || null,
      }),
    });
    setSaving(false);
    if (!res.success || !res.data) {
      const msg = res.errors?.company_name ?? res.message ?? "Failed to create customer.";
      setError(msg);
      toast.warning(msg);
      return;
    }
    props.onCreated({ id: res.data.id, company_name: res.data.company_name });
    props.onClose();
  };

  return (
    <Modal open={props.open} title="New customer" onClose={props.onClose}>
      <div class="space-y-4">
        <Field label="Company name *">
          <input
            class={inputClass}
            value={companyName()}
            onInput={(e) => setCompanyName(e.currentTarget.value)}
            placeholder="Customer name"
            autofocus
          />
        </Field>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mobile">
            <input class={inputClass} value={mobile()} onInput={(e) => setMobile(e.currentTarget.value)} />
          </Field>
          <Field label="Phone">
            <input class={inputClass} value={phone()} onInput={(e) => setPhone(e.currentTarget.value)} />
          </Field>
          <Field label="Email">
            <input type="email" class={inputClass} value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
          </Field>
          <Field label="TIN">
            <input class={inputClass} value={tin()} onInput={(e) => setTin(e.currentTarget.value)} />
          </Field>
        </div>
        <Field label="Address">
          <textarea class={inputClass} rows={2} value={address()} onInput={(e) => setAddress(e.currentTarget.value)} />
        </Field>
        <Show when={error()}>
          <p class="text-sm text-red-600">{error()}</p>
        </Show>
      </div>
      <div class="mt-6 flex justify-end gap-3 border-t border-stroke pt-4">
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={saving() || companyName().trim() === ""}
          onClick={() => void save()}
        >
          {saving() ? "Creating…" : "Create customer"}
        </button>
      </div>
    </Modal>
  );
}
