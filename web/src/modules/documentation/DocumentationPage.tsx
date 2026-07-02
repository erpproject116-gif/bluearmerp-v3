import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createMemo, Show } from "solid-js";
import { useAuth, canManageUsers } from "../../shared/auth-context";
import { DocumentationContent, DocumentationHome, DocumentationNav } from "./DocumentationLayout";
import { documentationGroups } from "./documentationGroups";
import {
  documentationSections,
  getDocSection,
  orderedSectionIds,
} from "./documentationSections";

export default function DocumentationPage() {
  const params = useParams<{ sectionId?: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const sectionsById = createMemo(() => new Map(documentationSections.map((s) => [s.id, s])));

  const isHome = () => !params.sectionId;

  const sectionId = () => {
    const id = params.sectionId;
    if (!id) return null;
    return sectionsById().has(id) ? id : null;
  };

  const section = () => {
    const id = sectionId();
    return id ? getDocSection(id) : null;
  };

  createEffect(() => {
    const id = params.sectionId;
    if (id && !sectionsById().has(id)) {
      navigate("/app/documentation", { replace: true });
    }
  });

  const selectSection = (id: string) => {
    navigate(`/app/documentation/${id}`);
  };

  const goHome = () => {
    navigate("/app/documentation");
  };

  const neighbors = createMemo(() => {
    const id = sectionId();
    if (!id) return {};
    const order = orderedSectionIds();
    const idx = order.indexOf(id);
    if (idx < 0) return {};
    const prev = idx > 0 ? order[idx - 1] : undefined;
    const next = idx < order.length - 1 ? order[idx + 1] : undefined;
    const map = sectionsById();
    return {
      prev: prev ? { id: prev, title: map.get(prev)?.title ?? prev } : undefined,
      next: next ? { id: next, title: map.get(next)?.title ?? next } : undefined,
    };
  });

  const adminNote = () =>
    section()?.id === "admin" && !canManageUsers(auth.me)
      ? "You may need administrator access to use these screens. Ask your store owner if you need help."
      : undefined;

  return (
    <div class="mx-auto max-w-6xl">
      <Show
        when={!isHome()}
        fallback={
          <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
            <DocumentationNav
              groups={documentationGroups}
              sectionsById={sectionsById()}
              activeId=""
              onSelect={selectSection}
              onHome={goHome}
            />
            <div class="min-w-0 flex-1">
              <DocumentationHome groups={documentationGroups} sectionsById={sectionsById()} onSelect={selectSection} />
            </div>
          </div>
        }
      >
        <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
          <DocumentationNav
            groups={documentationGroups}
            sectionsById={sectionsById()}
            activeId={sectionId() ?? ""}
            onSelect={selectSection}
            onHome={goHome}
          />
          <div class="min-w-0 flex-1 rounded-xl border border-stroke bg-white p-6 shadow-sm lg:p-8">
            <Show when={section()}>
              {(s) => (
                <DocumentationContent
                  title={s().title}
                  intro={s().intro}
                  blocks={s().blocks}
                  primaryHref={s().primaryHref}
                  primaryLabel={s().primaryLabel}
                  adminNote={adminNote()}
                  prev={neighbors().prev}
                  next={neighbors().next}
                  onNavigate={selectSection}
                />
              )}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
