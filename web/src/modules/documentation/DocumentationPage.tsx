import { useNavigate, useParams } from "@solidjs/router";
import { createEffect } from "solid-js";
import { useAuth, canManageUsers } from "../../shared/auth-context";
import { DocumentationContent, DocumentationNav } from "./DocumentationLayout";
import { defaultSectionId, documentationSections, getDocSection } from "./documentationSections";

export default function DocumentationPage() {
  const params = useParams<{ sectionId?: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const sectionId = () => {
    const id = params.sectionId;
    if (!id) return defaultSectionId;
    return documentationSections.some((s) => s.id === id) ? id : defaultSectionId;
  };

  const section = () => getDocSection(sectionId());

  createEffect(() => {
    const id = params.sectionId;
    if (id && !documentationSections.some((s) => s.id === id)) {
      navigate(`/app/documentation/${defaultSectionId}`, { replace: true });
    }
  });

  const selectSection = (id: string) => {
    navigate(`/app/documentation/${id}`);
  };

  const adminNote = () =>
    section().id === "admin" && !canManageUsers(auth.me)
      ? "You may need administrator access to use these screens. Ask your store owner if you need help."
      : undefined;

  return (
    <div class="space-y-6">
      <div>
        <h2 class="text-lg font-semibold text-text-primary">Help &amp; guides</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Plain-language instructions for each area of the app. Pick a topic on the left to read more.
        </p>
      </div>
      <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
        <DocumentationNav
          sections={documentationSections.map((s) => ({ id: s.id, title: s.title, iconId: s.iconId }))}
          activeId={sectionId()}
          onSelect={selectSection}
        />
        <DocumentationContent
          title={section().title}
          intro={section().intro}
          blocks={section().blocks}
          primaryHref={section().primaryHref}
          primaryLabel={section().primaryLabel}
          adminNote={adminNote()}
        />
      </div>
    </div>
  );
}
