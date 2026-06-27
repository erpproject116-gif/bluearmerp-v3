import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { modalDismissClass } from "../../../shared/Modal";
import { DataTableScroll, ResizableTd, ResizableTh } from "../../../shared/ResizableTable";
import { useResizableColumns } from "../../../shared/useResizableColumns";

export type UserSearchRow = {
  id: number;
  full_name: string;
  email: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (row: UserSearchRow) => void;
};

const USER_COLUMNS = [
  { key: "select", header: "Select", width: 88 },
  { key: "full_name", header: "Name", width: 200 },
  { key: "email", header: "Email", width: 220 },
] as const;

async function fetchUsers(q: string): Promise<UserSearchRow[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<UserSearchRow[]>(`/api/v1/inventory/after-sales/users${qs}`);
  return res.data ?? [];
}

export function UserSearchModal(props: Props) {
  const [query, setQuery] = createSignal("");
  const [users] = createResource(query, fetchUsers);

  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(() =>
    USER_COLUMNS.map((c) => ({ key: c.key, width: c.width })),
  );

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-2xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Search User</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>
          <div class="p-5">
            <Field label="Search">
              <input class={inputClass} value={query()} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="Name or email…" />
            </Field>
          </div>
          <Show when={users.loading}>
            <p class="px-5 pb-5 text-sm text-text-secondary">Loading…</p>
          </Show>
          <Show when={users()}>
            {(rows) => (
              <DataTableScroll class="max-h-[50vh] border-t border-stroke">
                <table class="erp-grid text-sm" style={{ width: `${tableWidth()}px`, "min-width": "100%" }}>
                  <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                    <tr>
                      <For each={USER_COLUMNS}>
                        {(c) => (
                          <ResizableTh columnKey={c.key} width={widthFor(c.key)} onResizeStart={onResizeStart} resizable={c.key !== "select"} class="px-3 py-2">
                            {c.header}
                          </ResizableTh>
                        )}
                      </For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={rows()}>
                      {(row) => (
                        <tr class="border-t border-stroke/60 hover:bg-slate-50">
                          <ResizableTd width={widthFor("select")} class="px-3 py-2">
                            <button
                              type="button"
                              class="text-brand-600 hover:underline"
                              onClick={() => {
                                props.onSelect(row);
                                props.onClose();
                              }}
                            >
                              Select
                            </button>
                          </ResizableTd>
                          <ResizableTd width={widthFor("full_name")} class="px-3 py-2">{row.full_name}</ResizableTd>
                          <ResizableTd width={widthFor("email")} class="px-3 py-2">{row.email}</ResizableTd>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </DataTableScroll>
            )}
          </Show>
        </div>
      </div>
    </Show>
  );
}
