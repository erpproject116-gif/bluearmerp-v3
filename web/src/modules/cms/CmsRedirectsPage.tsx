import { createSignal } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { submitEntity } from "../../shared/handleSaveResult";
import { apiFetch } from "../../shared/api";
import { useCmsRedirects, type CmsRedirect } from "../../shared/useCms";

export default function CmsRedirectsPage() {
  const { page, setPage, pageSize, setPageSize } = useListState("created_at", 25, { defaultOrder: "desc", defaultStatus: "" });
  const auth = useAuth();
  const toast = useToast();
  const canWrite = () => hasPermission(auth.me, "cms.pages_write", "write");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [fromSlug, setFromSlug] = createSignal("");
  const [toSlug, setToSlug] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const list = useCmsRedirects(() => ({ page: page(), pageSize: pageSize() }));

  return (
    <div>
      <SpreadsheetGrid<CmsRedirect>
        columns={[
          { key: "from_slug", header: "From" },
          { key: "to_slug", header: "To" },
          { key: "created_at", header: "Created" },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (r) =>
              canWrite() ? (
                <button
                  type="button"
                  class="text-sm text-red-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void apiFetch(`/api/v1/cms/redirects/${r.id}`, { method: "DELETE" }).then((res) => {
                      if (!res.success) {
                        toast.warning(res.message ?? "Delete failed.");
                        return;
                      }
                      toast.success("Deleted.");
                      void list.refetch();
                    });
                  }}
                >
                  Delete
                </button>
              ) : null,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => undefined}
        onNew={() => setModalOpen(true)}
        showNew={canWrite()}
        newLabel="New redirect"
        codeKey="from_slug"
        nameKey="to_slug"
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        onRefresh={() => void list.refetch()}
      />
      <EntityModal
        open={modalOpen()}
        title="New redirect"
        onClose={() => setModalOpen(false)}
        onSave={() => {
          void (async () => {
            setSaving(true);
            const ok = await submitEntity(
              () =>
                apiFetch("/api/v1/cms/redirects", {
                  method: "POST",
                  body: JSON.stringify({ from_slug: fromSlug().trim(), to_slug: toSlug().trim() }),
                }, { silent: true }),
              toast,
              "Redirect created.",
            );
            setSaving(false);
            if (!ok) return;
            setModalOpen(false);
            setFromSlug("");
            setToSlug("");
            void list.refetch();
          })();
        }}
        saving={saving()}
      >
        <Field label="From slug">
          <input class={inputClass} value={fromSlug()} onInput={(e) => setFromSlug(e.currentTarget.value)} placeholder="old-name" />
        </Field>
        <Field label="To slug">
          <input class={inputClass} value={toSlug()} onInput={(e) => setToSlug(e.currentTarget.value)} placeholder="new-name" />
        </Field>
      </EntityModal>
    </div>
  );
}
