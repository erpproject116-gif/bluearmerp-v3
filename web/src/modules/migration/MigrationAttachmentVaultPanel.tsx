import { createSignal, For, onMount, Show } from "solid-js";
import { apiAbsoluteUrl, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import { useToast } from "../../shared/toast";

type VaultRow = {
  id: number;
  legacy_doc_type: string;
  legacy_doc_no: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  checksum_sha256: string;
  is_orphan: boolean;
  linked_entity_type?: string;
  linked_entity_id?: number;
  created_at: string;
};

type ImportResult = {
  created: number;
  failed: number;
  orphans: number;
  row_errors?: { row: number; message: string }[];
};

const LINK_KINDS = [
  "open_quo",
  "open_so",
  "open_si",
  "open_po",
  "open_ap",
  "open_pr",
  "open_rfq",
  "opening_stock",
  "opening_lots",
  "in_transit",
] as const;

async function authHeadersMultipart(): Promise<Headers> {
  const headers = new Headers();
  const token = await getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const tenantId = getActiveTenantId();
  if (tenantId) headers.set("X-Tenant-ID", String(tenantId));
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers.set("X-Branch-ID", String(branchId));
  headers.set("X-User-Activity", "1");
  return headers;
}

export default function MigrationAttachmentVaultPanel() {
  const toast = useToast();
  const [loading, setLoading] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [orphans, setOrphans] = createSignal<VaultRow[]>([]);
  const [lastImport, setLastImport] = createSignal<ImportResult | null>(null);
  const [files, setFiles] = createSignal<FileList | null>(null);
  const [manifest, setManifest] = createSignal<File | null>(null);
  const [linkKind, setLinkKind] = createSignal<string>("open_quo");
  const [linkDocNo, setLinkDocNo] = createSignal("");
  const [linkingId, setLinkingId] = createSignal<number | null>(null);

  const loadOrphans = async () => {
    setLoading(true);
    const res = await apiFetch<{ items: VaultRow[] }>("/api/v1/migration/attachments?orphans=1");
    setLoading(false);
    if (res.success && res.data) {
      setOrphans(res.data.items ?? []);
    } else {
      toast.error(res.message || "Failed to list vault orphans.");
    }
  };

  onMount(() => {
    void loadOrphans();
  });

  const upload = async () => {
    const list = files();
    if (!list || list.length === 0) {
      toast.error("Choose one or more files.");
      return;
    }
    const fd = new FormData();
    for (let i = 0; i < list.length; i++) {
      fd.append("files", list[i]!);
    }
    const m = manifest();
    if (m) fd.append("manifest", m);
    setUploading(true);
    try {
      const res = await fetch(apiAbsoluteUrl("/api/v1/migration/attachments/import"), {
        method: "POST",
        headers: await authHeadersMultipart(),
        body: fd,
      });
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: ImportResult;
      };
      if (body.success && body.data) {
        setLastImport(body.data);
        toast.success(
          `Vault import: ${body.data.created} created, ${body.data.orphans} orphans, ${body.data.failed} failed.`,
        );
        setFiles(null);
        setManifest(null);
        void loadOrphans();
      } else {
        toast.error(body.message || "Import failed.");
      }
    } catch {
      toast.error("Network error during vault import.");
    } finally {
      setUploading(false);
    }
  };

  const linkRow = async (id: number) => {
    const docNo = linkDocNo().trim();
    if (!docNo) {
      toast.error("Enter the Migration Center source document number to link.");
      return;
    }
    setLinkingId(id);
    const res = await apiFetch(`/api/v1/migration/attachments/${id}/link`, {
      method: "POST",
      body: JSON.stringify({
        legacy_doc_type: linkKind(),
        legacy_doc_no: docNo,
      }),
    });
    setLinkingId(null);
    if (res.success) {
      toast.success("Linked — removed from orphans.");
      void loadOrphans();
    } else {
      toast.error(res.message || "Link failed.");
    }
  };

  return (
    <section class="space-y-3 rounded-xl border border-stroke bg-white p-5 shadow-sm">
      <div>
        <h3 class="text-sm font-semibold text-text-primary">Attachment vault (Lane C)</h3>
        <p class="mt-1 text-xs text-text-secondary">
          Upload files/PDFs/images from the legacy system. Files stay on local disk as orphans until you link them to a
          Migration Center import key (metadata only — does not copy into quotation/sales attachment tables).
        </p>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label class="block space-y-1 text-xs">
          <span class="font-medium text-text-secondary">Files</span>
          <input
            type="file"
            multiple
            class="block text-sm"
            disabled={uploading()}
            onChange={(e) => setFiles(e.currentTarget.files)}
          />
        </label>
        <label class="block space-y-1 text-xs">
          <span class="font-medium text-text-secondary">Manifest CSV (optional)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            class="block text-sm"
            disabled={uploading()}
            onChange={(e) => setManifest(e.currentTarget.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={uploading()}
          onClick={() => void upload()}
        >
          {uploading() ? "Uploading…" : "Import to vault"}
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          disabled={loading() || uploading()}
          onClick={() => void loadOrphans()}
        >
          Refresh orphans
        </button>
      </div>

      <Show when={lastImport()}>
        {(r) => (
          <p class="text-xs text-text-secondary">
            Last import: created {r().created}, orphans {r().orphans}, failed {r().failed}
            <Show when={(r().row_errors?.length ?? 0) > 0}>
              {" "}
              — first error: {r().row_errors![0]!.message}
            </Show>
          </p>
        )}
      </Show>

      <div class="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-stroke bg-slate-50 px-3 py-2">
        <label class="text-xs">
          <span class="font-medium text-text-secondary">Link kind</span>
          <select
            class="ml-2 rounded border border-stroke px-2 py-1 text-sm"
            value={linkKind()}
            onChange={(e) => setLinkKind(e.currentTarget.value)}
          >
            <For each={[...LINK_KINDS]}>{(k) => <option value={k}>{k}</option>}</For>
          </select>
        </label>
        <label class="text-xs">
          <span class="font-medium text-text-secondary">source_doc_no</span>
          <input
            class="ml-2 rounded border border-stroke px-2 py-1 text-sm"
            placeholder="legacy doc no"
            value={linkDocNo()}
            onInput={(e) => setLinkDocNo(e.currentTarget.value)}
          />
        </label>
        <span class="text-xs text-text-secondary">Applies to the Link button on each orphan row.</span>
      </div>

      <Show when={!loading()} fallback={<p class="text-xs text-text-secondary">Loading orphans…</p>}>
        <Show
          when={orphans().length > 0}
          fallback={<p class="text-xs text-text-secondary">No orphan vault files.</p>}
        >
          <div class="overflow-x-auto rounded-lg border border-stroke">
            <table class="min-w-full text-left text-xs">
              <thead class="border-b border-stroke bg-slate-50 text-text-secondary">
                <tr>
                  <th class="px-3 py-2 font-medium">File</th>
                  <th class="px-3 py-2 font-medium">Legacy type / no</th>
                  <th class="px-3 py-2 font-medium">Size</th>
                  <th class="px-3 py-2 font-medium">Created</th>
                  <th class="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                <For each={orphans()}>
                  {(row) => (
                    <tr class="border-b border-stroke last:border-0">
                      <td class="px-3 py-2">{row.file_name}</td>
                      <td class="px-3 py-2">
                        {row.legacy_doc_type || "—"} / {row.legacy_doc_no || "—"}
                      </td>
                      <td class="px-3 py-2">{row.byte_size}</td>
                      <td class="px-3 py-2 text-text-secondary">{row.created_at}</td>
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-1 text-xs disabled:opacity-50"
                          disabled={linkingId() === row.id}
                          onClick={() => void linkRow(row.id)}
                        >
                          Link
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </section>
  );
}
