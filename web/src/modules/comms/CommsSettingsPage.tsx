import { createEffect, createResource, createSignal, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useToast } from "../../shared/toast";
import { CommsLayout } from "./CommsLayout";

type GmailStatus = {
  id?: number;
  google_email?: string;
  status?: string;
  sync_status?: string;
  sync_error?: string | null;
  last_sync_at?: string | null;
  stub_mode?: boolean;
  oauth_configured?: boolean;
};

export default function CommsSettingsPage() {
  const auth = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [busy, setBusy] = createSignal(false);

  const canAdmin = () => hasPermission(auth.me, "comms.admin", "write");

  const [status, { refetch }] = createResource(async () => {
    const res = await apiFetch<GmailStatus>("/api/v1/comms/gmail/status");
    if (!res.success) throw new Error(res.message ?? "Failed to load Gmail status.");
    return res.data ?? {};
  });

  createEffect(() => {
    if (params.gmail_connected) toast.success("Gmail connected successfully.");
    if (params.gmail_error) toast.warning(`Gmail connection failed: ${String(params.gmail_error)}`);
  });

  const connect = async () => {
    setBusy(true);
    const res = await apiFetch<{ auth_url?: string; stub?: boolean; message?: string }>(
      "/api/v1/comms/gmail/connect",
      { method: "GET" },
      { silent: true },
    );
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to start Gmail connect.");
      return;
    }
    if (res.data?.stub) {
      toast.success(res.data.message ?? "Stub Gmail connection saved.");
      void refetch();
      return;
    }
    if (res.data?.auth_url) {
      window.location.href = res.data.auth_url;
    }
  };

  const disconnect = async () => {
    setBusy(true);
    const res = await apiFetch<unknown>("/api/v1/comms/gmail/disconnect", { method: "POST" }, { silent: true });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to disconnect Gmail.");
      return;
    }
    toast.success("Gmail disconnected.");
    void refetch();
  };

  const syncNow = async () => {
    setBusy(true);
    const res = await apiFetch<{ stub_mode?: boolean; messages_upserted?: number }>(
      "/api/v1/comms/gmail/sync",
      { method: "POST" },
      { silent: true },
    );
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Sync failed.");
      return;
    }
    const n = res.data?.messages_upserted ?? 0;
    toast.success(res.data?.stub_mode ? `Stub sync completed (${n} messages).` : `Sync completed (${n} new/updated).`);
    void refetch();
  };

  const connected = () => status()?.status === "active" && !!status()?.google_email;

  return (
    <CommsLayout>
      <Show when={canAdmin()} fallback={<p class="text-sm text-text-secondary">Communications admin permission required.</p>}>
        <div class="max-w-xl space-y-4 rounded-lg border border-stroke bg-white p-6 shadow-sm">
          <div>
            <h2 class="text-lg font-semibold text-text-primary">Gmail connection</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Connect your personal Gmail to send documents from your mailbox and sync replies into the Communication Center inbox.
            </p>
          </div>

          <Show when={status.loading}>
            <p class="text-sm text-text-secondary">Loading…</p>
          </Show>

          <Show when={!status.loading}>
            <Show when={status()?.stub_mode}>
              <p class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <strong>COMMS_GMAIL_STUB</strong> is active — set <code>GOOGLE_CLIENT_ID</code>,{" "}
                <code>GOOGLE_CLIENT_SECRET</code>, and <code>GOOGLE_OAUTH_REDIRECT</code> for live Gmail OAuth. Stub sync inserts
                placeholder inbox rows only.
              </p>
            </Show>

            <dl class="grid grid-cols-1 gap-2 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-text-secondary">Status</dt>
                <dd class="font-medium">{connected() ? "Connected" : "Not connected"}</dd>
              </div>
              <Show when={connected()}>
                <div class="flex justify-between gap-4">
                  <dt class="text-text-secondary">Google account</dt>
                  <dd class="font-medium">{status()?.google_email}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-text-secondary">Last sync</dt>
                  <dd>{status()?.last_sync_at ? new Date(status()!.last_sync_at!).toLocaleString() : "—"}</dd>
                </div>
                <Show when={status()?.sync_error}>
                  <div class="col-span-full text-red-600">{status()?.sync_error}</div>
                </Show>
              </Show>
            </dl>

            <div class="flex flex-wrap gap-2 pt-2">
              <Show
                when={connected()}
                fallback={
                  <button
                    type="button"
                    class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    disabled={busy()}
                    onClick={() => void connect()}
                  >
                    Connect Gmail
                  </button>
                }
              >
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void syncNow()}
                >
                  Sync now
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void disconnect()}
                >
                  Disconnect
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </CommsLayout>
  );
}
