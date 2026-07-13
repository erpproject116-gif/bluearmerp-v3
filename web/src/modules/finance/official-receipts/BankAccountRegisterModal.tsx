import { createResource, createSignal, For } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { Modal } from "../../../shared/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

async function fetchGL() {
  const res = await apiFetch<{ account_code: string; account_name: string }[]>("/api/v1/finance/gl-accounts");
  return res.data ?? [];
}

export function BankAccountRegisterModal(props: Props) {
  const toast = useToast();
  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [glCode, setGlCode] = createSignal("");
  const [keyword, setKeyword] = createSignal("");
  const [remark, setRemark] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [glAccounts] = createResource(() => props.open, fetchGL);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/v1/finance/bank-accounts", {
        method: "POST",
        body: JSON.stringify({
          bank_account_code: code().trim(),
          bank_account_name: name().trim(),
          gl_account_code: glCode(),
          keyword: keyword() || null,
          remark: remark() || null,
        }),
      });
      if (!res.success) throw new Error(res.message ?? "Failed to register bank account");
      toast.success("Bank account registered.");
      setCode("");
      setName("");
      setGlCode("");
      setKeyword("");
      setRemark("");
      props.onCreated();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={props.open} title="Register Bank Account" onClose={props.onClose} stacked>
      <div class="grid gap-3">
        <Field label="Bank Account Code">
          <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
        </Field>
        <Field label="Bank Account Name">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Field label="GL Account">
          <select class={inputClass} value={glCode()} onChange={(e) => setGlCode(e.currentTarget.value)}>
            <option value="">Select…</option>
            <For each={glAccounts() ?? []}>
              {(g) => <option value={g.account_code}>{g.account_code} — {g.account_name}</option>}
            </For>
          </select>
        </Field>
        <Field label="Keyword">
          <input class={inputClass} value={keyword()} onInput={(e) => setKeyword(e.currentTarget.value)} />
        </Field>
        <Field label="Remark">
          <input class={inputClass} value={remark()} onInput={(e) => setRemark(e.currentTarget.value)} />
        </Field>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={saving()} onClick={() => void save()}>
            {saving() ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
