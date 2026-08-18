import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { ModalField } from "../../shared/ModalField";
import { useCustomValues } from "../../shared/useCustomValues";
import { requireFields, submitEntity } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useListState } from "../../shared/useListState";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { CMS_ENTITY, CMS_SETTINGS_HREF } from "../../shared/entityTypes";
import { useCmsPages, type CmsPage } from "../../shared/useCms";
import { DEFAULT_CMS_TOPIC } from "./cmsPermalink";

export default function CmsPagesPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "updated_at",
    25,
    { defaultOrder: "desc", defaultStatus: "" },
  );
  const auth = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const canWrite = () => hasPermission(auth.me, "cms.pages_write", "write");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [topic, setTopic] = createSignal(DEFAULT_CMS_TOPIC);
  const [slug, setSlug] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(CMS_ENTITY.page);
  const list = useCmsPages(() => ({
    page: page(),
    pageSize,
    status: statusFilter() || undefined,
    q: q() || undefined,
    sort: sort(),
    order: order(),
  }));

  const openNew = () => {
    setTitle("");
    setTopic(DEFAULT_CMS_TOPIC);
    setSlug("");
    loadCustom({});
    setModalOpen(true);
  };

  const save = async () => {
    const clientError =
      requireFields({ title: title(), slug: slug() }, buildRequiredChecks(fields()).filter((c) => c.key === "title" || c.key === "slug")) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    setSaving(true);
    const payload = { title: title().trim(), slug: slug().trim() || undefined, topic: topic().trim() || DEFAULT_CMS_TOPIC, custom_values: customValues() };
    let createdId: number | null = null;
    const ok = await submitEntity(
      async () => {
        const res = await apiFetch<CmsPage>("/api/v1/cms/pages", { method: "POST", body: JSON.stringify(payload) }, { silent: true });
        if (res.success && res.data?.id) createdId = res.data.id;
        return res;
      },
      toast,
      "Page created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    if (createdId) nav(`/app/cms/pages/${createdId}`);
  };

  return (
    <div>
      <SpreadsheetGrid<CmsPage>
        columns={[
          { key: "title", header: "Title", clickable: true },
          { key: "topic", header: "Topic" },
          { key: "slug", header: "Slug", clickable: true },
          { key: "status", header: "Status" },
          { key: "updated_at", header: "Updated" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => nav(`/app/cms/pages/${row.id}`)}
        onNew={openNew}
        showNew={canWrite()}
        newLabel="New page"
        codeKey="slug"
        nameKey="title"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search title or slug…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "", label: "Open" },
          { value: "draft", label: "Draft" },
          { value: "published", label: "Published" },
          { value: "archived", label: "Archived" },
        ]}
        settingsHref={CMS_SETTINGS_HREF.page}
        onRefresh={() => void list.refetch()}
      />
      <EntityModal
        open={modalOpen()}
        title="New page"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <ModalField settings={byKey} fieldKey="title" fallbackLabel="Title" fallbackRequired>
          {(m) => (
            <input
              class={inputClass}
              value={title()}
              disabled={m.disabled}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="topic" fallbackLabel="Topic cluster">
          {(m) => (
            <input
              class={inputClass}
              placeholder={DEFAULT_CMS_TOPIC}
              value={topic()}
              disabled={m.disabled}
              onInput={(e) => setTopic(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="slug" fallbackLabel="Slug">
          {(m) => (
            <input
              class={inputClass}
              placeholder="optional-url-name"
              value={slug()}
              disabled={m.disabled}
              onInput={(e) => setSlug(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <Field label="">
          <p class="text-xs text-text-secondary">Topic + slug become the published URL /articles/topic/slug. Leave slug blank to generate it from the title. Body and SEO are on the next screen.</p>
        </Field>
        <CustomFieldsSection entityType={CMS_ENTITY.page} values={customValues} onChange={setCustom} />
      </EntityModal>
    </div>
  );
}
