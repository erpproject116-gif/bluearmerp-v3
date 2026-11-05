import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrPageHead } from "./HrUi";

type Client = { id: number; name: string };
type Access = { id: number; client_name: string; email: string; display_name: string; is_active: boolean; login_url: string };

export default function PortalAccessPage() {
  const toast = useToast();
  const [clientId, setClientId] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [name, setName] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [search, setSearch] = createSignal("");
  const [activeFilter, setActiveFilter] = createSignal<"" | "active" | "inactive">("");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [clients] = createResource(async () => (await apiFetch<Client[]>("/api/v1/hr/clients")).data ?? []);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Access[]>("/api/v1/hr/portal-access")).data ?? []);

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const af = activeFilter();
    return (rows() ?? []).filter((row) => {
      if (af === "active" && !row.is_active) return false;
      if (af === "inactive" && row.is_active) return false;
      if (!q) return true;
      return (
        row.client_name.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        (row.display_name || "").toLowerCase().includes(q)
      );
    });
  });

  const save = async () => {
    if (!clientId() || !email().trim()) return toast.warning("Choose a client and enter an email.");
    const res = await apiFetch(`/api/v1/hr/clients/${clientId()}/portal-users`, {
      method: "POST",
      body: JSON.stringify({ email: email().trim(), display_name: name().trim() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save portal access.");
    setEmail("");
    setName("");
    setModalOpen(false);
    void refetch();
    toast.success("Portal access saved.");
  };

  return (
    <HrLayout>
      <HrPageHead
        title={
          <>
            Portal access
          </>
        }
        subtitle="This login opens the customer portal. It does not open HR pages, and it does not show pay."
        actions={
          <button type="button" class="hr-btn hr-btn-primary" onClick={() => setModalOpen(true)}>
            + Invite client user
          </button>
        }
      />


      <SpreadsheetGrid
        columns={[
          { key: "client_name", header: "Client" },
          { key: "display_name", header: "Name" },
          { key: "email", header: "Email" },
          {
            key: "role",
            header: "Role",
            sortable: false,
            render: () => (
              <span class="hr-muted">
                Client Rep
              </span>
            ),
            exportValue: () => "Client Rep",
          },
          {
            key: "is_active",
            header: "Status",
            render: (row) => (
              <HrBadge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</HrBadge>
            ),
            exportValue: (row) => (row.is_active ? "Active" : "Inactive"),
          },
          {
            key: "login_url",
            header: "Sign-in",
            render: (row) => (
              <Show when={row.login_url} fallback={<span class="hr-muted">No link</span>}>
                <a class="text-brand-700" href={row.login_url}>
                  Open portal
                </a>
              </Show>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            sortable: false,
            hideable: false,
            render: (row) => (
              <details class="hr-menu hr-rowmenu">
                <summary class="hr-rowmenu-btn" aria-label="Row actions">
                  ⋯
                </summary>
                <div>
                  <Show when={row.login_url}>
                    <a class="menu-item" href={row.login_url}>
                      Open portal
                    </a>
                  </Show>
                  <button
                    type="button"
                    class="menu-item"
                    onClick={() => toast.warning("Resend invite needs backend.")}
                  >
                    Resend invite
                  </button>
                  <button type="button" class="menu-item" onClick={() => toast.warning("Revoke needs backend.")}>
                    Revoke
                  </button>
                </div>
              </details>
            ),
          },
        ]}
        rows={filtered()}
        loading={rows.loading}
        selectedId={selected()}
        onSelect={setSelected}
        onEdit={(row) => setSelected(row.id)}
        onNew={() => setModalOpen(true)}
        showNew={false}
        hideExport
        codeKey="email"
        nameKey="client_name"
        search={search()}
        onSearchChange={setSearch}
        searchPlaceholder="Search client, name, email…"
        toolbarExtra={
          <div class="hr-seg" role="group" aria-label="Status filter">
            <button type="button" classList={{ on: activeFilter() === "" }} onClick={() => setActiveFilter("")}>
              All
            </button>
            <button type="button" classList={{ on: activeFilter() === "active" }} onClick={() => setActiveFilter("active")}>
              Active
            </button>
            <button
              type="button"
              classList={{ on: activeFilter() === "inactive" }}
              onClick={() => setActiveFilter("inactive")}
            >
              Inactive
            </button>
          </div>
        }
      />

      <Show when={modalOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Invite client user"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setModalOpen(false);
          }}
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Invite client user</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Client">
                <select class={inputClass} value={clientId()} onChange={(e) => setClientId(e.currentTarget.value)}>
                  <option value="">Choose</option>
                  <For each={clients() ?? []}>{(client) => <option value={client.id}>{client.name}</option>}</For>
                </select>
              </Field>
              <Field label="Email">
                <input class={inputClass} value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
              </Field>
              <Field label="Name">
                <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
              </Field>
              <div class="rounded-lg border border-dashed border-stroke bg-panel p-3 text-sm">
                <b>Branch scope / Client Approver role</b>
                <p class="hr-muted mt-1">Invites create Client Rep portal access for the whole client today.</p>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => void save()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
