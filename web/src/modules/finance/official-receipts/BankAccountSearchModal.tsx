import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Modal } from "../../../shared/Modal";
import { LoadingText } from "../../../shared/LoadingText";

export type BankAccountOption = {
  id: number;
  bank_account_code: string;
  bank_account_name: string;
  gl_account_code: string;
  gl_account_name?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (bank: BankAccountOption) => void;
  onRegister: () => void;
};

async function fetchBanks(q: string) {
  const qs = new URLSearchParams({ page: "1", pageSize: "50", sort: "bank_account_name", order: "asc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<BankAccountOption[]>(`/api/v1/finance/bank-accounts?${qs}`);
  return res.data ?? [];
}

export function BankAccountSearchModal(props: Props) {
  const [q, setQ] = createSignal("");
  const [banks] = createResource(q, fetchBanks);

  return (
    <Modal open={props.open} title="Search Bank Account" onClose={props.onClose} stacked>
      <div class="space-y-3">
        <input class="w-full rounded-lg border border-stroke px-3 py-2 text-sm" placeholder="Search code or name…" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <button type="button" class="text-sm text-brand-600 hover:underline" onClick={props.onRegister}>
          Register new bank account
        </button>
        <Show when={banks.loading}>
          <LoadingText class="text-sm text-text-secondary" as="p" />
        </Show>
        <div class="max-h-80 overflow-y-auto rounded border border-stroke">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-2 py-1 text-left">Code</th>
                <th class="px-2 py-1 text-left">Name</th>
                <th class="px-2 py-1 text-left">GL</th>
              </tr>
            </thead>
            <tbody>
              <For each={banks() ?? []}>
                {(row) => (
                  <tr class="cursor-pointer hover:bg-slate-50" onClick={() => props.onSelect(row)}>
                    <td class="px-2 py-1">{row.bank_account_code}</td>
                    <td class="px-2 py-1">{row.bank_account_name}</td>
                    <td class="px-2 py-1">{row.gl_account_code}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
