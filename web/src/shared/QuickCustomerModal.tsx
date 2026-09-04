import { createEffect, createSignal, Show } from "solid-js";
import { Modal } from "./Modal";
import { Field, inputClass } from "./SpreadsheetGrid";
import { apiFetch } from "./api";
import { handleSaveResult } from "./handleSaveResult";
import { useToast } from "./toast";
import {
  buildPartnerContactPayload,
  PHTIN_PLACEHOLDER,
  validatePartnerContact,
  type PartnerContactErrors,
} from "./validation/phContact";

type CreatedPartner = { id: number; company_name: string };

export type QuickPartnerKind = "customer" | "vendor";

type Props = {
  open: boolean;
  /** Defaults to customer (sales/quotation/POS). Use vendor for PO / purchases. */
  partnerKind?: QuickPartnerKind;
  initialName?: string;
  onClose: () => void;
  onCreated: (partner: CreatedPartner) => void;
};

/**
 * Lightweight create-partner dialog for document modals.
 * Full editing lives on the Partners page.
 */
export function QuickCustomerModal(props: Props) {
  const toast = useToast();
  const kind = () => props.partnerKind ?? "customer";
  const noun = () => (kind() === "vendor" ? "vendor" : "customer");
  const title = () => (kind() === "vendor" ? "New vendor" : "New customer");

  const [companyName, setCompanyName] = createSignal("");
  const [mobile, setMobile] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [tin, setTin] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<PartnerContactErrors & { company_name?: string }>({});

  const fieldError = (key: keyof (PartnerContactErrors & { company_name?: string })) => fieldErrors()[key];

  createEffect(() => {
    if (props.open) {
      setCompanyName(props.initialName ?? "");
      setMobile("");
      setPhone("");
      setEmail("");
      setTin("");
      setAddress("");
      setFieldErrors({});
      setSaving(false);
    }
  });

  const save = async () => {
    setFieldErrors({});
    const name = companyName().trim();
    const contact = {
      mobile: mobile(),
      phone: phone(),
      email: email(),
      tin: tin(),
    };
    const contactErrors = validatePartnerContact(contact);
    if (!name) {
      setFieldErrors({ company_name: "Company name is required.", ...contactErrors });
      toast.error("Company name is required.");
      return;
    }
    if (Object.keys(contactErrors).length > 0) {
      setFieldErrors(contactErrors);
      toast.error(Object.values(contactErrors)[0] ?? "Check the highlighted fields.");
      return;
    }

    setSaving(true);
    const contactPayload = buildPartnerContactPayload(contact);
    try {
      const res = await apiFetch<CreatedPartner>(
        "/api/v1/inventory/partners",
        {
          method: "POST",
          body: JSON.stringify({
            partner_kind: kind(),
            status: "active",
            company_name: name,
            ...contactPayload,
            address: address().trim() || null,
          }),
        },
        { silent: true },
      );
      const ok = handleSaveResult(res, toast, kind() === "vendor" ? "Vendor created." : "Customer created.");
      if (!ok) {
        if (res.errors) {
          setFieldErrors({
            company_name: res.errors.company_name,
            mobile: res.errors.mobile,
            phone: res.errors.phone,
            email: res.errors.email,
            tin: res.errors.tin,
          });
        }
        return;
      }
      if (res.data) {
        props.onCreated({ id: res.data.id, company_name: res.data.company_name });
        props.onClose();
      }
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={props.open} title={title()} onClose={props.onClose} stacked>
      <div class="space-y-4">
        <Field label="Company name *">
          <input
            class={inputClass}
            value={companyName()}
            onInput={(e) => setCompanyName(e.currentTarget.value)}
            placeholder={kind() === "vendor" ? "Vendor / supplier name" : "Customer name"}
            autofocus
          />
          <Show when={fieldError("company_name")}>
            <p class="mt-1 text-xs text-red-600">{fieldError("company_name")}</p>
          </Show>
        </Field>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mobile">
            <input
              class={inputClass}
              value={mobile()}
              placeholder="0917 123 4567"
              onInput={(e) => setMobile(e.currentTarget.value)}
            />
            <Show when={fieldError("mobile")}>
              <p class="mt-1 text-xs text-red-600">{fieldError("mobile")}</p>
            </Show>
          </Field>
          <Field label="Phone">
            <input
              class={inputClass}
              value={phone()}
              placeholder="(032) 123 4567"
              onInput={(e) => setPhone(e.currentTarget.value)}
            />
            <Show when={fieldError("phone")}>
              <p class="mt-1 text-xs text-red-600">{fieldError("phone")}</p>
            </Show>
          </Field>
          <Field label="Email">
            <input
              type="email"
              class={inputClass}
              value={email()}
              placeholder="name@company.com"
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
            <Show when={fieldError("email")}>
              <p class="mt-1 text-xs text-red-600">{fieldError("email")}</p>
            </Show>
          </Field>
          <Field label="TIN">
            <input
              class={inputClass}
              value={tin()}
              placeholder={PHTIN_PLACEHOLDER}
              onInput={(e) => setTin(e.currentTarget.value)}
            />
            <Show when={fieldError("tin")}>
              <p class="mt-1 text-xs text-red-600">{fieldError("tin")}</p>
            </Show>
          </Field>
        </div>
        <Field label="Address">
          <textarea class={inputClass} rows={2} value={address()} onInput={(e) => setAddress(e.currentTarget.value)} />
        </Field>
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
          {saving() ? "Creating…" : `Create ${noun()}`}
        </button>
      </div>
    </Modal>
  );
}
