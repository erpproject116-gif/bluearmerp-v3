import { Show, createSignal } from "solid-js";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useCmsMedia, useCmsMutations, type CmsMedia } from "../../shared/useCms";
import { downloadCmsBlob, fetchCmsMediaBlob, uploadCmsMedia } from "../../shared/cmsMedia";
import { formatFileSize } from "../../shared/attachments";

export default function CmsMediaPage() {
  const { page, setPage, q, setQ, pageSize, setPageSize } = useListState("created_at", 25, { defaultOrder: "desc", defaultStatus: "" });
  const auth = useAuth();
  const toast = useToast();
  const canWrite = () => hasPermission(auth.me, "cms.media_write", "write");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const list = useCmsMedia(() => ({ page: page(), pageSize: pageSize(), q: q() || undefined }));
  const mutations = useCmsMutations();

  const onUpload = async (file: File) => {
    setUploading(true);
    const res = await uploadCmsMedia(file, file.name);
    setUploading(false);
    if (!res.success) {
      toast.warning(res.message ?? "Upload failed.");
      return;
    }
    toast.success("Uploaded.");
    void list.refetch();
  };

  return (
    <div>
      <Show when={canWrite()}>
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
            disabled={uploading()}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void onUpload(f);
            }}
          />
          <p class="text-xs text-text-secondary">PNG, JPEG, GIF, WebP, or PDF. Max 25 MB.</p>
        </div>
      </Show>
      <SpreadsheetGrid<CmsMedia>
        columns={[
          { key: "file_name", header: "File", clickable: true },
          { key: "mime_type", header: "Type" },
          {
            key: "alt_text",
            header: "Alt",
            sortable: false,
            render: (r) => (
              <Show when={canWrite()} fallback={<span>{r.alt_text || "—"}</span>}>
                <input
                  class="w-40 rounded border border-stroke px-1 text-sm"
                  value={r.alt_text || ""}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (v === (r.alt_text || "")) return;
                    void mutations.patchMedia.mutateAsync({ id: r.id, alt_text: v }).then(() => toast.success("Alt saved.")).catch((err) => toast.warning(err instanceof Error ? err.message : "Save failed."));
                  }}
                />
              </Show>
            ),
          },
          {
            key: "size_bytes",
            header: "Size",
            render: (r) => formatFileSize(r.size_bytes),
            exportValue: (r) => r.size_bytes,
          },
          { key: "created_at", header: "Uploaded" },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (r) => (
              <div class="flex gap-2">
                <button
                  type="button"
                  class="text-sm text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void fetchCmsMediaBlob(r.id).then((blob) => {
                      if (!blob) {
                        toast.warning("Could not download.");
                        return;
                      }
                      downloadCmsBlob(blob, r.file_name);
                    });
                  }}
                >
                  Download
                </button>
                <Show when={canWrite()}>
                  <button
                    type="button"
                    class="text-sm text-red-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void mutations.deleteMedia.mutateAsync(r.id).then(() => toast.success("Deleted.")).catch((err) => toast.warning(err instanceof Error ? err.message : "Delete failed."));
                    }}
                  >
                    Delete
                  </button>
                </Show>
              </div>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => undefined}
        onNew={() => undefined}
        showNew={false}
        codeKey="file_name"
        nameKey="file_name"
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search file name…"
        onRefresh={() => void list.refetch()}
      />
    </div>
  );
}
