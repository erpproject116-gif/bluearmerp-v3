import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { ModalField } from "../../shared/ModalField";
import { useCustomValues } from "../../shared/useCustomValues";
import { requireFields } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { CMS_ENTITY } from "../../shared/entityTypes";
import { useCmsMedia, useCmsMutations, useCmsPage, useCmsRevisions, useCmsTopics } from "../../shared/useCms";
import { uploadCmsMedia } from "../../shared/cmsMedia";
import { insertCmsMediaToken } from "./CmsMarkdown";
import { CmsBodyEditor } from "./CmsBodyEditor";
import { CmsSeoPanel } from "./CmsSeoPanel";
import { formatFileSize } from "../../shared/attachments";
import type { CmsArticlePaste } from "./cmsMarkdownCodec";
import { firstParagraphPlain } from "./cmsMarkdownCodec";
import { cmsArticlePath, cmsTopicOrDefault, DEFAULT_CMS_TOPIC } from "./cmsPermalink";

export default function CmsPageEditorPage() {
  const params = useParams();
  const nav = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const canWrite = () => hasPermission(auth.me, "cms.pages_write", "write");
  const canPublish = () => hasPermission(auth.me, "cms.pages_publish", "write") || canWrite();
  const catalogCode = (import.meta.env.VITE_CMS_PUBLIC_TENANT_CODE as string | undefined)?.trim() || "BLUEARM";
  const canGenerate = () => canWrite() && (auth.me?.tenant?.company_code || "").toUpperCase() === catalogCode.toUpperCase();
  const id = () => {
    const n = Number(params.id);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const doc = useCmsPage(id);
  const media = useCmsMedia(() => ({ page: 1, pageSize: 50 }));
  const topics = useCmsTopics();
  const revisions = useCmsRevisions(id);
  const mutations = useCmsMutations();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(CMS_ENTITY.page);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const [title, setTitle] = createSignal("");
  const [topic, setTopic] = createSignal(DEFAULT_CMS_TOPIC);
  const [slug, setSlug] = createSignal("");
  const [body, setBody] = createSignal("");
  const [seoTitle, setSeoTitle] = createSignal("");
  const [seoDesc, setSeoDesc] = createSignal("");
  const [lang, setLang] = createSignal("tl");
  const [focusPhrase, setFocusPhrase] = createSignal("");
  const [visibility, setVisibility] = createSignal("internal");
  const [featuredId, setFeaturedId] = createSignal<number | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [ugat, setUgat] = createSignal("");
  const [dirty, setDirty] = createSignal(false);
  const [updatedAt, setUpdatedAt] = createSignal("");
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

  createEffect((prev: string | undefined) => {
    const d = doc.data;
    if (!d) return prev;
    if (prev === d.updated_at) return prev;
    setTitle(d.title);
    setTopic(cmsTopicOrDefault(d.topic));
    setSlug(d.slug);
    setBody(d.body ?? "");
    setSeoTitle(d.seo_title ?? "");
    setSeoDesc(d.seo_description ?? "");
    setLang(d.lang || "tl");
    setFocusPhrase(d.focus_phrase ?? "");
    setVisibility(d.visibility || "internal");
    setFeaturedId(d.featured_media_id ?? null);
    setUpdatedAt(d.updated_at);
    setDirty(false);
    loadCustom(d.custom_values ?? {});
    return d.updated_at;
  });

  const markDirty = () => setDirty(true);

  const permalink = () => cmsArticlePath(topic(), slug());
  const featuredAlt = () => media.data?.rows?.find((r) => r.id === featuredId())?.alt_text ?? doc.data?.featured_media_alt ?? "";

  const save = async (silent = false) => {
    const pageId = id();
    if (pageId == null) return false;
    const err =
      requireFields({ title: title(), slug: slug() }, buildRequiredChecks(fields()).filter((c) => c.key === "title" || c.key === "slug")) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (err) {
      if (!silent) toast.warning(err);
      return false;
    }
    try {
      const saved = await mutations.patchPage.mutateAsync({
        id: pageId,
        body: {
          title: title().trim(),
          topic: topic().trim() || DEFAULT_CMS_TOPIC,
          slug: slug().trim(),
          body: body(),
          seo_title: seoTitle().trim() || null,
          seo_description: seoDesc().trim() || null,
          featured_media_id: featuredId(),
          lang: lang(),
          focus_phrase: focusPhrase().trim() || null,
          visibility: visibility(),
          updated_at: updatedAt(),
          leave_redirect: true,
          custom_values: customValues(),
        },
      });
      setUpdatedAt(saved.updated_at);
      setDirty(false);
      if (!silent) toast.success("Saved.");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      toast.warning(msg);
      return false;
    }
  };

  const scheduleAutosave = () => {
    markDirty();
    if (!canWrite()) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void save(true);
    }, 2000);
  };

  onMount(() => {
    const onLeave = (ev: BeforeUnloadEvent) => {
      if (!dirty()) return;
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    onCleanup(() => {
      window.removeEventListener("beforeunload", onLeave);
      if (autosaveTimer) clearTimeout(autosaveTimer);
    });
  });

  const publish = async () => {
    const pageId = id();
    if (pageId == null) return;
    if (!body().trim()) {
      toast.warning("Write or paste the article body, then Save and Publish. The published page was showing only the title because the body was empty.");
      return;
    }
    const first = firstParagraphPlain(body());
    if (!seoDesc().trim() && !first) toast.warning("Add an SEO description or a first paragraph before publishing.");
    if (!featuredId()) toast.warning("Add a featured image with alt text for sharing.");
    const ok = await save();
    if (!ok) return;
    try {
      await mutations.publishPage.mutateAsync(pageId);
      toast.success("Published.");
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : "Publish failed.");
    }
  };

  const insertMedia = async (file: File) => {
    setUploading(true);
    const res = await uploadCmsMedia(file, file.name);
    setUploading(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Upload failed.");
      return;
    }
    setBody((b) => insertCmsMediaToken(b, res.data!.id, res.data!.alt_text || res.data!.file_name));
    if (featuredId() == null) setFeaturedId(res.data.id);
    scheduleAutosave();
    toast.success("Image inserted.");
    void media.refetch();
  };

  const applyPastedArticle = (meta: CmsArticlePaste) => {
    if (meta.title) setTitle(meta.title);
    if (meta.topic) setTopic(meta.topic);
    if (meta.slug) setSlug(meta.slug);
    if (meta.seoTitle) setSeoTitle(meta.seoTitle);
    if (meta.seoDescription) setSeoDesc(meta.seoDescription);
    scheduleAutosave();
  };

  return (
    <div>
      <A href="/app/cms" class="text-sm text-brand-600 hover:underline">← Pages</A>
      <Show when={doc.isError}>
        <p class="mt-3 text-sm text-red-600">{(doc.error as Error)?.message}</p>
      </Show>
      <Show when={doc.data}>
        {(d) => (
          <div class="mt-3 space-y-3">
            <p class="text-sm text-text-secondary">
              Status: {d().status}
              <Show when={slug() && d().status === "published"}>
                {" "}
                ·{" "}
                <a class="text-brand-600 hover:underline" href={permalink()} target="_blank" rel="noopener noreferrer">
                  Open published (new tab)
                </a>
              </Show>
              <Show when={dirty()}>
                {" "}· Unsaved
              </Show>
            </p>
            <p class="rounded-lg border border-stroke bg-slate-50 px-3 py-2 font-mono text-xs text-text-secondary">
              Permalink: <span class="text-text-primary">{permalink()}</span>
            </p>
            <ModalField settings={byKey} fieldKey="title" fallbackLabel="Title" fallbackRequired>
              {(m) => (
                <input class={`${inputClass} text-lg font-semibold`} value={title()} disabled={m.disabled || !canWrite()} onInput={(e) => { setTitle(e.currentTarget.value); scheduleAutosave(); }} />
              )}
            </ModalField>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ModalField settings={byKey} fieldKey="topic" fallbackLabel="Topic cluster">
                {(m) => (
                  <>
                    <input
                      class={inputClass}
                      list="cms-topics"
                      placeholder={DEFAULT_CMS_TOPIC}
                      value={topic()}
                      disabled={m.disabled || !canWrite()}
                      onInput={(e) => { setTopic(e.currentTarget.value); scheduleAutosave(); }}
                    />
                    <datalist id="cms-topics">
                      <For each={topics.data ?? []}>{(t) => <option value={t.topic} />}</For>
                    </datalist>
                  </>
                )}
              </ModalField>
              <ModalField settings={byKey} fieldKey="slug" fallbackLabel="Slug" fallbackRequired>
                {(m) => (
                  <input class={inputClass} value={slug()} disabled={m.disabled || !canWrite()} onInput={(e) => { setSlug(e.currentTarget.value); scheduleAutosave(); }} />
                )}
              </ModalField>
              <ModalField settings={byKey} fieldKey="lang" fallbackLabel="Language">
                {(m) => (
                  <input class={inputClass} value={lang()} disabled={m.disabled || !canWrite()} onInput={(e) => { setLang(e.currentTarget.value); scheduleAutosave(); }} />
                )}
              </ModalField>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModalField settings={byKey} fieldKey="visibility" fallbackLabel="Visibility">
                {(m) => (
                  <select class={inputClass} value={visibility()} disabled={m.disabled || !canWrite()} onChange={(e) => { setVisibility(e.currentTarget.value); scheduleAutosave(); }}>
                    <option value="internal">Internal</option>
                    <option value="public">Public catalog</option>
                  </select>
                )}
              </ModalField>
              <ModalField settings={byKey} fieldKey="focus_phrase" fallbackLabel="Focus phrase">
                {(m) => (
                  <input class={inputClass} value={focusPhrase()} disabled={m.disabled || !canWrite()} onInput={(e) => { setFocusPhrase(e.currentTarget.value); scheduleAutosave(); }} />
                )}
              </ModalField>
            </div>
            <ModalField settings={byKey} fieldKey="seo_title" fallbackLabel="SEO title">
              {(m) => (
                <input class={inputClass} placeholder="Browser tab title (optional)" value={seoTitle()} disabled={m.disabled || !canWrite()} onInput={(e) => { setSeoTitle(e.currentTarget.value); scheduleAutosave(); }} />
              )}
            </ModalField>
            <ModalField settings={byKey} fieldKey="seo_description" fallbackLabel="SEO description">
              {(m) => (
                <textarea class={inputClass} rows={2} maxlength={320} value={seoDesc()} disabled={m.disabled || !canWrite()} onInput={(e) => { setSeoDesc(e.currentTarget.value); scheduleAutosave(); }} />
              )}
            </ModalField>
            <CmsSeoPanel
              title={title()}
              topic={topic()}
              slug={slug()}
              permalink={permalink()}
              body={body()}
              seoTitle={seoTitle()}
              seoDescription={seoDesc()}
              featuredMediaId={featuredId()}
              featuredMediaAlt={featuredAlt()}
              focusPhrase={focusPhrase()}
            />
            <div class="flex flex-wrap items-end gap-2">
              <Show when={canWrite()}>
                <label
                  class={`inline-flex h-[38px] shrink-0 cursor-pointer items-center rounded-lg border border-stroke bg-white px-3 text-sm font-medium text-text-primary shadow-sm hover:bg-slate-50 ${uploading() ? "pointer-events-none opacity-60" : ""}`}
                >
                  <span>{uploading() ? "Uploading…" : "Upload image"}</span>
                  <input
                    type="file"
                    class="sr-only"
                    accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                    disabled={uploading()}
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0];
                      e.currentTarget.value = "";
                      if (f) void insertMedia(f);
                    }}
                  />
                </label>
              </Show>
              <Show when={canGenerate()}>
                <input
                  class={`${inputClass} min-w-[12rem] flex-1`}
                  placeholder="Optional ugat / angle"
                  value={ugat()}
                  onInput={(e) => setUgat(e.currentTarget.value)}
                />
                <button
                  type="button"
                  class="inline-flex h-[38px] shrink-0 items-center rounded-lg border border-stroke bg-white px-3 text-sm font-medium text-text-primary shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  disabled={mutations.generatePage.isPending}
                  onClick={() => {
                    const pageId = id();
                    if (pageId == null) return;
                    void mutations.generatePage.mutateAsync({ id: pageId, ugat: ugat() })
                      .then((row) => {
                        toast.success("Draft generated. Review before Publish.");
                        setTitle(row.title);
                        setTopic(cmsTopicOrDefault(row.topic));
                        setSlug(row.slug);
                        setBody(row.body ?? "");
                        setSeoTitle(row.seo_title ?? "");
                        setSeoDesc(row.seo_description ?? "");
                        setUpdatedAt(row.updated_at);
                        setDirty(false);
                      })
                      .catch((e) => toast.warning(e instanceof Error ? e.message : "Generate failed."));
                  }}
                >
                  {mutations.generatePage.isPending ? "Generating…" : "Draft with Baiko"}
                </button>
              </Show>
            </div>
            <p class="text-xs text-text-secondary">PNG, JPEG, GIF, WebP, or PDF. Max 25 MB. Upload inserts into the body and sets the featured image when none is set.</p>
            <ModalField settings={byKey} fieldKey="body" fallbackLabel="Body" as="div">
              {(m) => (
                <CmsBodyEditor
                  markdown={body()}
                  onMarkdown={(md) => { setBody(md); scheduleAutosave(); }}
                  onPasteArticle={applyPastedArticle}
                  disabled={!canWrite() || m.disabled}
                />
              )}
            </ModalField>
            <Show when={canWrite()}>
              <CustomFieldsSection entityType={CMS_ENTITY.page} values={customValues} onChange={setCustom} />
              <div class="flex flex-wrap gap-2">
                <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" disabled={mutations.patchPage.isPending} onClick={() => void save()}>
                  Save
                </button>
                <Show when={canPublish()}>
                  <button
                    type="button"
                    class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
                    disabled={mutations.publishPage.isPending || mutations.patchPage.isPending}
                    onClick={() => void publish()}
                  >
                    Publish
                  </button>
                  <Show when={d().status === "published"}>
                    <button
                      type="button"
                      class="rounded-lg border border-stroke px-3 py-2 text-sm"
                      disabled={mutations.unpublishPage.isPending}
                      onClick={() => void mutations.unpublishPage.mutateAsync(d().id).then(() => toast.success("Unpublished.")).catch((e) => toast.warning(e instanceof Error ? e.message : "Unpublish failed."))}
                    >
                      Unpublish
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="rounded-lg border border-stroke px-3 py-2 text-sm"
                    disabled={mutations.archivePage.isPending}
                    onClick={() => void mutations.archivePage.mutateAsync(d().id).then(() => { toast.success("Archived."); nav("/app/cms"); }).catch((e) => toast.warning(e instanceof Error ? e.message : "Archive failed."))}
                  >
                    Archive
                  </button>
                </Show>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-2 text-sm"
                  onClick={() => {
                    const pageId = id();
                    if (pageId == null) return;
                    void mutations.previewToken.mutateAsync(pageId).then((t) => {
                      window.open(t.url, "_blank", "noopener,noreferrer");
                    }).catch((e) => toast.warning(e instanceof Error ? e.message : "Preview failed."));
                  }}
                >
                  Preview
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-2 text-sm"
                  disabled={mutations.clonePage.isPending}
                  onClick={() => void mutations.clonePage.mutateAsync(d().id).then((row) => { toast.success("Cloned."); nav(`/app/cms/pages/${row.id}`); }).catch((e) => toast.warning(e instanceof Error ? e.message : "Clone failed."))}
                >
                  Clone
                </button>
              </div>
            </Show>
            <Show when={(revisions.data ?? []).length}>
              <div class="text-sm">
                <p class="font-medium">Revisions</p>
                <ul class="mt-1 space-y-1">
                  <For each={revisions.data ?? []}>
                    {(rev) => (
                      <li class="flex gap-2">
                        <span class="text-text-secondary">{rev.created_at}</span>
                        <Show when={canWrite()}>
                          <button
                            type="button"
                            class="text-brand-600 hover:underline"
                            onClick={() => {
                              const pageId = id();
                              if (pageId == null) return;
                              void mutations.restoreRevision.mutateAsync({ id: pageId, rid: rev.id })
                                .then(() => toast.success("Restored to draft."))
                                .catch((e) => toast.warning(e instanceof Error ? e.message : "Restore failed."));
                            }}
                          >
                            Restore
                          </button>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
            <Show when={canWrite() && media.data?.rows?.length}>
              <p class="text-xs text-text-secondary">
                Recent files: <For each={(media.data?.rows ?? []).slice(0, 6)}>{(row) => <span>{row.file_name} ({formatFileSize(row.size_bytes)}) · </span>}</For>
              </p>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
