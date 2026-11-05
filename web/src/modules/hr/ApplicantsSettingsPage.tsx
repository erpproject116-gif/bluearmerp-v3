import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { useAuth } from "../../shared/auth-context";
import { HR_ENTITY } from "../../shared/entityTypes";
import { HrNotice } from "./HrUi";

export default function ApplicantsSettingsPage() {
  const auth = useAuth();
  const code = () => (auth.me?.tenant?.company_code ?? "").trim();

  return (
    <div class="space-y-4">
      <HrNotice>
        Visible labels, required flags, and custom fields here drive the public application form at{" "}
        <code class="text-xs">/apply/&lt;company_code&gt;</code>. File-type custom fields on the public form are
        Planned.
        <Show when={code()}>
          <span class="mt-2 flex flex-wrap gap-3">
            <A
              class="font-medium text-brand-700 hover:underline"
              href={`/apply/${encodeURIComponent(code())}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open public form ↗
            </A>
            <A
              class="font-medium text-brand-700 hover:underline"
              href={`/careers/${encodeURIComponent(code())}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Job board ↗
            </A>
          </span>
        </Show>
      </HrNotice>
      <EntityFormSettingsPage
        entityType={HR_ENTITY.application}
        featureLabel="Applicants"
        listHref="/app/hr/applicants"
      />
    </div>
  );
}
