import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Client = { id: number; name: string };
type Access = { id: number; client_name: string; email: string; display_name: string; is_active: boolean; login_url: string };

export default function PortalAccessPage() {
  const toast = useToast();
  const [clientId, setClientId] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [name, setName] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [clients] = createResource(async () => (await apiFetch<Client[]>("/api/v1/hr/clients")).data ?? []);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Access[]>("/api/v1/hr/portal-access")).data ?? []);

  const save = async () => {
    if (!clientId() || !email().trim()) return toast.warning("Choose a client and enter an email.");
    const res = await apiFetch(`/api/v1/hr/clients/${clientId()}/portal-users`, {
      method: "POST",
      body: JSON.stringify({ email: email().trim(), display_name: name().trim() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save portal access.");
    setEmail("");
    setName("");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-4 text-2xl font-semibold">Portal access</h1>
      <p class="mb-3 text-sm text-text-secondary">This login opens the customer portal. It does not open HR pages, and it does not show pay.</p>
      <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 md:grid-cols-4">
        <Field label="Client">
          <select class={inputClass} value={clientId()} onChange={(e) => setClientId(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={clients() ?? []}>{(client) => <option value={client.id}>{client.name}</option>}</For>
          </select>
        </Field>
        <Field label="Email"><input class={inputClass} value={email()} onInput={(e) => setEmail(e.currentTarget.value)} /></Field>
        <Field label="Name"><input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} /></Field>
        <button type="button" class="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void save()}>Save access</button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "client_name", header: "Client" },
          { key: "email", header: "Email" },
          { key: "display_name", header: "Name" },
          { key: "is_active", header: "Active", render: (row) => row.is_active ? "Yes" : "No" },
          {
            key: "login_url",
            header: "Sign-in",
            render: (row) => (
              <Show when={row.login_url} fallback={<span class="text-text-secondary">No link</span>}>
                <a class="text-brand-700" href={row.login_url}>Open portal</a>
              </Show>
            ),
          },
        ]}
        rows={rows() ?? []}
        loading={rows.loading}
        selectedId={selected()}
        onSelect={setSelected}
        onEdit={(row) => setSelected(row.id)}
        onNew={() => {}}
        showNew={false}
        codeKey="email"
        nameKey="client_name"
      />
    </HrLayout>
  );
}
